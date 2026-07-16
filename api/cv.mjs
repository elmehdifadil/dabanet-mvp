import Groq from "groq-sdk";

// Extracts profile fields from an uploaded CV (PDF or Word) using AI.
// POST { filename, data (base64) } → { niveau, filiere, experience, langues, competences, objectif }

const NIVEAUX = [
  "Bac",
  "Bac+2 — DEUG / DUT / BTS / DTS",
  "Bac+3 — Licence / Licence Pro / Bachelor",
  "Bac+4 — Maîtrise",
  "Bac+5 — Master / Master Spécialisé",
  "Bac+5 — Diplôme d'Ingénieur d'État",
  "Bac+6+ — Doctorat / PhD",
  "Diplôme OFPPT — Technicien",
  "Diplôme OFPPT — Technicien Spécialisé",
  "Diplôme OFPPT — Qualification professionnelle",
];
const EXPERIENCES = ["بدون خبرة", "تدريب فقط (stage)", "أقل من سنة", "1-3 سنوات", "3-5 سنوات", "أكثر من 5 سنوات"];

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
            '- "langues": langues parlées séparées par des virgules (ex: "Arabe, Français, Anglais")\n' +
            '- "competences": les 5-8 compétences clés séparées par des virgules\n' +
            '- "objectif": une phrase résumant le poste/secteur visé (déduis-le du CV, ou "")\n' +
            "N'invente RIEN : si une information est absente du CV, mets une chaîne vide.",
        },
        { role: "user", content: "Voici le texte du CV :\n\n" + text },
      ],
    });

    let fields = {};
    try { fields = JSON.parse(completion.choices[0].message.content); } catch { fields = {}; }
    res.status(200).json({
      success: true,
      fields: {
        niveau: fields.niveau || "",
        filiere: fields.filiere || "",
        experience: fields.experience || "",
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
