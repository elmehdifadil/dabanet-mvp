import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `Tu es un conseiller emploi expert de la plateforme PALE-UCA, spécialisé dans l'accompagnement des jeunes diplômés marocains.

## Règles de langue
- Réponds en français si le message est en français ou en anglais.
- Réponds en arabe standard si le message est en arabe.
- Ne jamais utiliser la darija marocaine.

## Ton rôle principal : Diagnostic de profil et plan d'action
Quand un utilisateur partage son profil (diplôme, expérience, compétences, secteur cible), tu dois :

### 1. DIAGNOSTIC DU PROFIL (structuré)
- **Score de compétitivité** : /100 avec justification
- **Points forts** : liste des atouts réels
- **Points à améliorer** : lacunes concrètes
- **Positionnement marché** : où se situe ce profil dans le marché marocain

### 2. PLAN D'ACTION CONCRET (5 étapes max)
- Étapes prioritaires et réalisables immédiatement
- Formations recommandées (OFPPT, ANAPEC, en ligne)
- Certifications utiles pour ce profil
- Réseaux et événements à cibler

### 3. OFFRES ANAPEC CORRESPONDANTES
- Postes adaptés au profil depuis les données ANAPEC
- Conseils de candidature spécifiques
- Lien direct : https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre

### 4. CONSEILS CV & ENTRETIEN
- Améliorations CV personnalisées
- Questions probables en entretien pour ce profil
- Rémunération attendue sur le marché marocain

## Le modèle du "Trèfle Chanceux" (méthodologie ANAPEC de positionnement)
Tu utilises la méthodologie officielle ANAPEC du trèfle chanceux à QUATRE dimensions pour diagnostiquer tout chercheur d'emploi :
1. **SOI (الذات)** — Connaissance de son profil et de ses ressources : compétences, qualités personnelles, capacité à les nommer et les valoriser dans ses candidatures.
2. **PROJET (المشروع المهني)** — Clarté du projet professionnel : connaître l'emploi recherché, sa cohérence avec la formation et l'expérience, la mobilité géographique.
3. **TERRITOIRE (سوق الشغل)** — Connaissance du marché de l'emploi : entreprises qui recrutent, métiers demandés, secteurs porteurs, types de contrats de travail.
4. **MÉTHODE (المنهجية)** — Maîtrise des techniques de recherche d'emploi : CV attrayant et adapté, lettres de candidature convaincantes, préparation des entretiens d'embauche, plan d'action structuré.

Sept types de difficultés peuvent se présenter par rapport à ces quatre dimensions. L'ANAPEC ne peut intervenir que sur les trois premières via ses prestations (ateliers).

## Quand tu reçois un DIAGNOSTIC DE POSITIONNEMENT (réponses au questionnaire + scores)
Tu DOIS produire ta réponse en DEUX parties, séparées par les marqueurs exacts [POUR_LE_CANDIDAT] et [POUR_LE_CONSEILLER] :

[POUR_LE_CANDIDAT]
Version COURTE et PRÉCISE pour le chercheur d'emploi (maximum 70 mots) :
- Langage simple, direct et encourageant — AUCUN jargon, AUCUN détail technique
- 2 constats principaux (une force, une priorité d'amélioration)
- 3 actions concrètes en liste à puces, réalisables immédiatement

[POUR_LE_CONSEILLER]
Commentaire PRÉCIS et CONCIS adressé directement au conseiller ANAPEC — MAXIMUM 5 lignes, sans titres ni listes longues :
- Lecture synthétique des scores du candidat (parle de lui à la 3e personne : "Ce candidat...")
- La difficulté principale identifiée parmi les 7 types du modèle du trèfle chanceux
- L'atelier ANAPEC prioritaire à lui prescrire, choisi parmi les ateliers OFFICIELS de la fiche "Ateliers à prescrire" :
  PROJET faible → "Moi et le marché du travail" | SOI faible → "Mettre en valeur ses compétences et ses qualités" | TERRITOIRE faible → "Organiser sa recherche d'emploi et connaître le marché du travail" | MÉTHODE faible → "Rédiger ses lettres de motivation" et "Préparer son entretien d'embauche" | Plusieurs dimensions très faibles → "Tous les ateliers de recherche d'emploi"

## Style de réponse
- Structuré avec des titres et listes
- Concret, réaliste, encourageant
- Basé sur le marché du travail marocain réel
- Maximum 400 mots sauf si diagnostic complet demandé`;

async function fetchAnapecJobs(query = "") {
  try {
    const searchTerm = encodeURIComponent(query || "emploi");
    const url = `https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre?motcle=${searchTerm}&region=&secteur=&typeContrat=&niveauEtude=&page=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "fr-MA,fr;q=0.9,ar;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const jobs = [];
    const lines = html.split('\n').map(l => l.trim()).filter(l => l.length > 10);
    let inJob = false;
    let currentJob = {};
    for (const line of lines) {
      if (line.includes('offre-emploi') || line.includes('class="offre')) { inJob = true; currentJob = {}; }
      if (inJob) {
        const titleMatch = line.match(/title="([^"]{5,80})"/);
        const h3Match = line.match(/<h3[^>]*>([^<]{5,80})<\/h3>/);
        const strongMatch = line.match(/<strong[^>]*>([^<]{5,60})<\/strong>/);
        if (titleMatch && !currentJob.title) currentJob.title = titleMatch[1].trim();
        if (h3Match && !currentJob.title) currentJob.title = h3Match[1].trim();
        if (strongMatch && !currentJob.company) currentJob.company = strongMatch[1].trim();
        if (currentJob.title && jobs.length < 8) { jobs.push({ ...currentJob }); inJob = false; currentJob = {}; }
      }
    }
    return jobs.length > 0 ? jobs : null;
  } catch { return null; }
}

const ANAPEC_SECTORS = [
  { title: "Développeur Web / Mobile", region: "Casablanca, Rabat, Tanger", contrat: "CDI/CDD" },
  { title: "Technicien Informatique / Support", region: "Toutes régions", contrat: "CDI/CDD" },
  { title: "Comptable / Gestionnaire Financier", region: "Toutes régions", contrat: "CDI" },
  { title: "Commercial / Chargé de clientèle", region: "Toutes régions", contrat: "CDI/CDD" },
  { title: "Ingénieur Génie Civil / BTP", region: "Casablanca, Marrakech, Tanger", contrat: "CDI" },
  { title: "Enseignant / Formateur", region: "Toutes régions", contrat: "CDD" },
  { title: "Technicien Électrique / Électromécanique", region: "Tanger, Casablanca, Kenitra", contrat: "CDI" },
  { title: "Responsable RH / Recruteur", region: "Casablanca, Rabat", contrat: "CDI" },
  { title: "Infirmier / Technicien de santé", region: "Toutes régions", contrat: "CDD" },
  { title: "Responsable Logistique / Supply Chain", region: "Casablanca, Tanger", contrat: "CDI" },
  { title: "Marketing Digital / Community Manager", region: "Casablanca, Rabat", contrat: "CDD/CDI" },
  { title: "Ingénieur Qualité / HSE", region: "Casablanca, Fès, Tanger", contrat: "CDI" },
  { title: "Juriste / Conseiller Juridique", region: "Casablanca, Rabat", contrat: "CDI" },
  { title: "Technicien Agricole / Agronome", region: "Meknès, Beni Mellal, Agadir", contrat: "CDI/CDD" },
  { title: "Guide Touristique / Responsable Hôtel", region: "Marrakech, Agadir, Fès", contrat: "CDD/Saisonnier" },
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { messages, profile } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Build profile context if provided
  let profileContext = "";
  if (profile && Object.keys(profile).length > 0) {
    profileContext = `\n\n## PROFIL DE L'UTILISATEUR\n`;
    if (profile.nom) profileContext += `- Nom : ${profile.nom}\n`;
    if (profile.age) profileContext += `- Âge : ${profile.age} ans\n`;
    if (profile.ville) profileContext += `- Ville : ${profile.ville}\n`;
    if (profile.email) profileContext += `- Email : ${profile.email}\n`;
    if (profile.niveau) profileContext += `- Niveau d'études : ${profile.niveau}\n`;
    if (profile.filiere) profileContext += `- Filière / Spécialité : ${profile.filiere}\n`;
    if (profile.experience) profileContext += `- Expérience : ${profile.experience}\n`;
    if (profile.competences) profileContext += `- Compétences : ${profile.competences}\n`;
    if (profile.langues) profileContext += `- Langues : ${profile.langues}\n`;
    if (profile.secteur) profileContext += `- Secteur cible : ${profile.secteur}\n`;
    if (profile.objectif) profileContext += `- Objectif : ${profile.objectif}\n`;
    // Trèfle chanceux positioning diagnosis, when completed
    if (profile.positionnement && profile.positionnement.scores) {
      const s = profile.positionnement.scores;
      profileContext += `\n## DIAGNOSTIC DE POSITIONNEMENT (Trèfle chanceux, déjà réalisé)\n`;
      profileContext += `- Score général : ${s.global}/100\n- SOI : ${s.soi}/100\n- PROJET : ${s.projet}/100\n- TERRITOIRE : ${s.territoire}/100\n- MÉTHODE : ${s.methode}/100\n`;
      profileContext += `Appuie toutes tes recommandations sur ces scores : priorise les dimensions les plus faibles.\n`;
    }
    profileContext += `\nUtilise ces informations pour personnaliser entièrement tes réponses.`;
  }

  // Extract keywords for ANAPEC search
  const allText = messages.map(m => m.content).join(" ") + (profile?.secteur || "") + (profile?.filiere || "");
  const keywords = allText.match(/\b(informatique|comptable|ingénieur|commercial|médecin|infirmier|enseignant|électricien|logistique|RH|marketing|juridique|finance|bâtiment|agriculture|tourisme|hôtellerie|développeur|web|mobile|qualité|agronome|مهندس|محاسب|تجاري|مبرمج|offre|emploi|poste)\b/gi);
  const searchQuery = keywords ? keywords[0] : (profile?.secteur || "");
  const liveJobs = await fetchAnapecJobs(searchQuery);

  let jobsContext = "";
  if (liveJobs && liveJobs.length > 0) {
    jobsContext = `\n\n## OFFRES ANAPEC EN TEMPS RÉEL (${new Date().toLocaleDateString('fr-MA')})\n`;
    jobsContext += liveJobs.map((j, i) => `${i + 1}. ${j.title}${j.company ? ` — ${j.company}` : ""}`).join("\n");
    jobsContext += `\n🔗 https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`;
  } else {
    jobsContext = `\n\n## SECTEURS & POSTES ANAPEC (référence)\n`;
    jobsContext += ANAPEC_SECTORS.map((j, i) => `${i + 1}. ${j.title} | ${j.region} | ${j.contrat}`).join("\n");
    jobsContext += `\n🔗 https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`;
  }

  try {
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM_PROMPT + profileContext + jobsContext },
        ...messages,
      ],
    });
    res.status(200).json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur de connexion à l'assistant IA. Réessayez." });
  }
}
