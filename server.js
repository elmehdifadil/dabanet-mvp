import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

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

async function fetchAnapecJobs(query = "") {
  try {
    const searchTerm = encodeURIComponent(query || "توظيف");
    const url = `https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre?motcle=${searchTerm}&region=&secteur=&typeContrat=&niveauEtude=&page=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "fr-MA,fr;q=0.9" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const jobs = [];
    const lines = html.split('\n').map(l => l.trim()).filter(l => l.length > 10);
    let currentJob = {};
    for (const line of lines) {
      const titleMatch = line.match(/title="([^"]{5,80})"/);
      const h3Match = line.match(/<h3[^>]*>([^<]{5,80})<\/h3>/);
      const strongMatch = line.match(/<strong[^>]*>([^<]{5,60})<\/strong>/);
      if (titleMatch && !currentJob.title) { currentJob.title = titleMatch[1].trim(); }
      if (h3Match && !currentJob.title) { currentJob.title = h3Match[1].trim(); }
      if (strongMatch && !currentJob.company) { currentJob.company = strongMatch[1].trim(); }
      if (currentJob.title && jobs.length < 8) { jobs.push({ ...currentJob }); currentJob = {}; }
    }
    return jobs.length > 0 ? jobs : null;
  } catch (err) {
    return null;
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { messages } = JSON.parse(body);
        const lastMsg = messages[messages.length - 1]?.content || "";
        const keywords = lastMsg.match(/\b(informatique|comptable|ingénieur|commercial|médecin|infirmier|enseignant|électricien|logistique|RH|marketing|développeur|web|مهندس|محاسب|تجاري|مبرمج|خدمة|عمل|offre|emploi)\b/gi);
        const liveJobs = await fetchAnapecJobs(keywords?.[0] || "");
        let jobsContext = liveJobs?.length > 0
          ? `\n\n--- OFFRES ANAPEC EN TEMPS RÉEL ---\n` + liveJobs.map((j,i) => `${i+1}. ${j.title}${j.company ? ` — ${j.company}` : ""}`).join("\n") + `\nhttps://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`
          : `\n\n--- SECTEURS ANAPEC ---\n` + ANAPEC_SECTORS.map((j,i) => `${i+1}. ${j.title} | ${j.region} | ${j.contrat}`).join("\n") + `\nhttps://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`;

        const response = await client.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          max_tokens: 600,
          messages: [{ role: 'system', content: SYSTEM_PROMPT + jobsContext }, ...messages],
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: response.choices[0].message.content }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`\n✅ DabaNet → http://localhost:${PORT}\n`));
