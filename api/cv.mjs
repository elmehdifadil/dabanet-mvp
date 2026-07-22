import Groq from "groq-sdk";
import { put } from "@vercel/blob";

// Extracts profile fields from an uploaded CV (PDF or Word) using AI.
// POST { filename, data (base64) } → { niveau, filiere, experience, langues, competences, objectif }

const NIVEAUX = [
  "DUT — Diplôme Universitaire de Technologie (Bac+2)",
  "DEUG / DEUST (Bac+2)",
  "Licence Fondamentale (Bac+3)",
  "Licence Professionnelle (Bac+3)",
  "Licence d'Éducation (Bac+3)",
  "Master (Bac+5)",
  "Master Spécialisé (Bac+5)",
  "Diplôme d'Ingénieur d'État (Bac+5)",
  "Doctorat (Bac+8)",
];
const ETABLISSEMENTS = [
  "FSSM — Faculté des Sciences Semlalia",
  "FSTG — Faculté des Sciences et Techniques Guéliz",
  "FSJES — Faculté des Sciences Juridiques, Économiques et Sociales",
  "FLSH — Faculté des Lettres et des Sciences Humaines",
  "FMPM — Faculté de Médecine et de Pharmacie",
  "FLAM — Faculté de la Langue Arabe",
  "ENSA Marrakech — École Nationale des Sciences Appliquées",
  "ENSA Safi — École Nationale des Sciences Appliquées",
  "ENCG — École Nationale de Commerce et de Gestion",
  "ENS — École Normale Supérieure",
  "EST Safi — École Supérieure de Technologie",
  "EST Essaouira — École Supérieure de Technologie",
  "FP Safi — Faculté Polydisciplinaire",
  "FP Kelâa des Sraghna — Faculté Polydisciplinaire",
  "FSJES Kelâa des Sraghna — Faculté des Sciences Juridiques, Économiques et Sociales",
  "Faculté de Médecine Dentaire — Marrakech",
];
const EXPERIENCES = ["Sans expérience", "Stage uniquement", "Moins d'un an", "1-3 ans", "3-5 ans", "Plus de 5 ans"];

async function extractText(filename, buffer) {
  const lower = (filename || "").toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const out = await pdfParse(buffer);
    return out.text || "";
  }
  if (lower.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const out = await mammoth.extractRawText({ buffer });
    return out.value || "";
  }
  if (lower.endsWith(".doc")) {
    // Legacy .doc: best-effort binary text extraction (UTF-16 + latin1 segments)
    const u16 = buffer.toString("utf16le");
    const seg16 = u16.match(/[ -~À-ſ؀-ۿ]{12,}/g) || [];
    const l1 = buffer.toString("latin1");
    const seg1 = l1.match(/[\x20-\x7E\xC0-\xFF]{25,}/g) || [];
    return (seg16.length > seg1.length ? seg16 : seg1).join("\n");
  }
  throw new Error("Format non supporté. Utilisez un fichier PDF ou Word (.docx).");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  try {
    const { filename, data } = req.body || {};
    if (!filename || !data) { res.status(400).json({ error: "filename et data (base64) requis" }); return; }

    const buffer = Buffer.from(data, "base64");
    if (buffer.length > 4 * 1024 * 1024) { res.status(400).json({ error: "Fichier trop volumineux (4 Mo max)" }); return; }

    const text = (await extractText(filename, buffer)).slice(0, 12000);
    if (text.trim().length < 50) {
      res.status(422).json({ error: "Impossible de lire le contenu du CV. Essayez un PDF ou un .docx." });
      return;
    }

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Tu extrais les informations d'un CV marocain (français, arabe ou anglais) et tu réponds UNIQUEMENT en JSON avec ces clés :\n" +
            `- "niveau": le diplôme le plus élevé, choisi EXACTEMENT parmi : ${JSON.stringify(NIVEAUX)} (ou "" si introuvable)\n` +
            `- "experience": durée totale d'expérience professionnelle, choisie EXACTEMENT parmi : ${JSON.stringify(EXPERIENCES)} (ou "" si introuvable)\n` +
            '- "filiere": la spécialité/le domaine du diplôme, court (ex: "Informatique — Développement Web", "Comptabilité et Finance")\n' +
            `- "etablissement": l'établissement de l'Université Cadi Ayyad où le diplôme a été obtenu, choisi EXACTEMENT parmi : ${JSON.stringify(ETABLISSEMENTS)} (ou "" si introuvable ou hors UCA)\n` +
            '- "anneeDiplome": l\'année d\'obtention du diplôme principal (ex: "2024", ou "" si introuvable)\n' +
            '- "autresDiplomes": autres diplômes ou certificats avec leur année, séparés par des virgules (ex: "Technicien comptabilité en 2022"), ou ""\n' +
            '- "experienceDetail": résumé des expériences en une ligne : postes, entreprises et durées (ex: "Stagiaire comptable chez X (6 mois), assistant chez Y (1 an)")\n' +
            '- "langues": langues parlées AVEC niveau si mentionné, séparées par des virgules (ex: "Arabe : natif, Français : courant, Anglais : intermédiaire")\n' +
            '- "competences": les 5-8 compétences clés séparées par des virgules\n' +
            '- "objectif": une phrase résumant le poste/secteur visé (déduis-le du CV, ou "")\n' +
            "N'invente RIEN : si une information est absente du CV, mets une chaîne vide.",
        },
        { role: "user", content: "Voici le texte du CV :\n\n" + text },
      ],
    });

    let fields = {};
    try { fields = JSON.parse(completion.choices[0].message.content); } catch { fields = {}; }

    // Store the CV file so the conseiller can view it from the back office
    let cvUrl = "";
    try {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const blob = await put(`cvs/${Date.now()}-${safe}`, buffer, {
          access: "public",
          contentType: filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
        });
        cvUrl = blob.url;
      }
    } catch (e) { console.error("cv store error:", e.message); }

    res.status(200).json({
      cvUrl,
      cvName: filename,
      success: true,
      fields: {
        niveau: fields.niveau || "",
        etablissement: fields.etablissement || "",
        anneeDiplome: fields.anneeDiplome || "",
        autresDiplomes: fields.autresDiplomes || "",
        filiere: fields.filiere || "",
        experience: fields.experience || "",
        experienceDetail: fields.experienceDetail || "",
        langues: fields.langues || "",
        competences: fields.competences || "",
        objectif: fields.objectif || "",
      },
    });
  } catch (err) {
    console.error("cv api error:", err);
    res.status(500).json({ error: err.message });
  }
}
