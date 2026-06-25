import Groq from "groq-sdk";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `أنت مساعد ذكي ديال منصة DabaNet، كاتساعد الخريجين المغاربة باش يلقاو خدمة.
**خاصك دايما تجاوب بالدارجة المغربية** (مزيج ديال العربية الدارجة والفرنسية كيما كايتكلم المغاربة).

أمثلة على أسلوبك:
- "واخا أخي، خليني نشوف ليك شي offres..."
- "عندك offres zwina فـ ANAPEC، بغيت نفصل ليك؟"
- "راك فـ الطريق الصحيح، خاصك غير..."

مهامك:
1. تقترح عليه offres خدمة من ANAPEC بناءً على مؤهلاته
2. تساعده يحسن CV ديالو
3. تعطيه نصائح على interviews
4. توجهه للتكوينات المناسبة

إلا عطاك المستخدم معلومات على مؤهلاته ولا مجاله، استعمل données ديال ANAPEC اللي عندك باش تقترح عليه offres مناسبة.
جاوب بإيجاز (3-4 جمل) ما عدا إلا طلب تفصيل أكثر.`;

async function fetchAnapecJobs(query = "") {
  try {
    const searchTerm = encodeURIComponent(query || "توظيف");
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

    // Extract job listings from ANAPEC HTML
    const jobs = [];
    const jobRegex = /<div[^>]*class="[^"]*offre[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    const titleRegex = /class="[^"]*titre[^"]*"[^>]*>\s*([^<]{5,80})/i;
    const entrepriseRegex = /class="[^"]*entreprise[^"]*"[^>]*>\s*([^<]{3,60})/i;
    const lieuRegex = /class="[^"]*lieu[^"]*"[^>]*>\s*([^<]{3,40})/i;

    // Also try simpler extraction from page content
    const lines = html.split('\n').map(l => l.trim()).filter(l => l.length > 10);
    let inJob = false;
    let currentJob = {};

    for (const line of lines) {
      if (line.includes('offre-emploi') || line.includes('class="offre')) {
        inJob = true;
        currentJob = {};
      }
      if (inJob) {
        const titleMatch = line.match(/title="([^"]{5,80})"/);
        const h3Match = line.match(/<h3[^>]*>([^<]{5,80})<\/h3>/);
        const h4Match = line.match(/<h4[^>]*>([^<]{5,80})<\/h4>/);
        const strongMatch = line.match(/<strong[^>]*>([^<]{5,60})<\/strong>/);

        if (titleMatch && !currentJob.title) currentJob.title = titleMatch[1].trim();
        if (h3Match && !currentJob.title) currentJob.title = h3Match[1].trim();
        if (h4Match && !currentJob.subtitle) currentJob.subtitle = h4Match[1].trim();
        if (strongMatch && !currentJob.company) currentJob.company = strongMatch[1].trim();

        if (currentJob.title && jobs.length < 8) {
          jobs.push({ ...currentJob });
          inJob = false;
          currentJob = {};
        }
      }
    }

    // Fallback: extract any job-like text patterns
    if (jobs.length === 0) {
      const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]{20,200})"/i);
      const pageTitle = html.match(/<title>([^<]{5,100})<\/title>/i);
      if (pageTitle) jobs.push({ title: "Offres ANAPEC disponibles", subtitle: pageTitle[1] });
    }

    return jobs.length > 0 ? jobs : null;

  } catch (err) {
    console.error("ANAPEC fetch error:", err.message);
    return null;
  }
}

// Static ANAPEC job sectors as fallback
const ANAPEC_SECTORS = [
  { title: "Technicien Informatique / Développeur", region: "Casablanca, Rabat", contrat: "CDI/CDD" },
  { title: "Comptable / Gestionnaire Financier", region: "Toutes régions", contrat: "CDI" },
  { title: "Commercial / Chargé de clientèle", region: "Toutes régions", contrat: "CDI/CDD" },
  { title: "Ingénieur Génie Civil / BTP", region: "Casablanca, Marrakech", contrat: "CDI" },
  { title: "Enseignant / Formateur", region: "Toutes régions", contrat: "CDD" },
  { title: "Technicien Électrique / Électromécanique", region: "Tanger, Casablanca", contrat: "CDI" },
  { title: "Responsable RH / Chargé de recrutement", region: "Casablanca, Rabat", contrat: "CDI" },
  { title: "Infirmier / Technicien de santé", region: "Toutes régions", contrat: "CDD" },
  { title: "Opérateur de saisie / Secrétaire", region: "Toutes régions", contrat: "CDD" },
  { title: "Responsable Logistique / Supply Chain", region: "Casablanca, Tanger", contrat: "CDI" },
  { title: "Chef de projet / Coordinateur", region: "Rabat, Casablanca", contrat: "CDI" },
  { title: "Agent de sécurité / Gardien", region: "Toutes régions", contrat: "CDI" },
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  // Extract keywords from last user message to search ANAPEC
  const lastMsg = messages[messages.length - 1]?.content || "";
  const keywords = lastMsg.match(/\b(informatique|comptable|ingénieur|commercial|médecin|infirmier|enseignant|électricien|logistique|RH|marketing|juridique|finance|bâtiment|agriculture|tourisme|hôtellerie|développeur|programmer|web|مهندس|محاسب|تجاري|مبرمج|خدمة|عمل|offre|emploi|poste|recrutement)\b/gi);

  const searchQuery = keywords ? keywords[0] : "";
  const liveJobs = await fetchAnapecJobs(searchQuery);

  // Build jobs context
  let jobsContext = "";
  if (liveJobs && liveJobs.length > 0) {
    jobsContext = `\n\n--- OFFRES ANAPEC EN TEMPS RÉEL (${new Date().toLocaleDateString('fr-MA')}) ---\n`;
    jobsContext += liveJobs.map((j, i) =>
      `${i + 1}. ${j.title}${j.company ? ` — ${j.company}` : ""}${j.subtitle ? ` (${j.subtitle})` : ""}`
    ).join("\n");
    jobsContext += `\nLien: https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`;
  } else {
    // Use static fallback
    jobsContext = `\n\n--- SECTEURS & OFFRES ANAPEC (données de référence) ---\n`;
    jobsContext += ANAPEC_SECTORS.map((j, i) =>
      `${i + 1}. ${j.title} | ${j.region} | ${j.contrat}`
    ).join("\n");
    jobsContext += `\nPour voir toutes les offres: https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`;
  }

  try {
    const response = await client.chat.completions.create({
      model: "llama-3.1-8b-instant",
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT + jobsContext },
        ...messages,
      ],
    });

    res.status(200).json({ reply: response.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في الاتصال بالمساعد الذكي" });
  }
}
