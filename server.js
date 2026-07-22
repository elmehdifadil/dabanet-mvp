import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SYSTEM_PROMPT = `أنت مساعد ذكي لمنصة PALE-UCA، تساعد الخريجين المغاربة في إيجاد عمل.

قواعد اللغة:
- إذا كتب المستخدم بالعربية، أجب بالعربية الفصحى البسيطة.
- إذا كتب بالفرنسية أو بالإنجليزية، أجب بالفرنسية.
- لا تستخدم الدارجة المغربية أبداً.

مهامك:
1. اقتراح عروض العمل من ANAPEC بحسب مؤهلات المستخدم
2. مساعدته في تحسين سيرته الذاتية (CV)
3. تقديم نصائح للمقابلات (entretiens)
4. توجيهه نحو التكوينات المناسبة

أجب بشكل موجز (3-4 جمل) ما لم يطلب تفصيلاً أكثر.

---

Tu es un assistant intelligent de la plateforme PALE-UCA. Tu aides les jeunes diplômés marocains à trouver un emploi.
Règle : réponds toujours en français si l'utilisateur écrit en français ou en anglais.
Sois concis (3-4 phrases) sauf si on te demande plus de détails.`;

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
];

async function fetchAnapecJobs(query = "") {
  try {
    const searchTerm = encodeURIComponent(query || "emploi");
    const url = `https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre?motcle=${searchTerm}`;
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
      if (titleMatch && !currentJob.title) currentJob.title = titleMatch[1].trim();
      if (h3Match && !currentJob.title) currentJob.title = h3Match[1].trim();
      if (strongMatch && !currentJob.company) currentJob.company = strongMatch[1].trim();
      if (currentJob.title && jobs.length < 8) { jobs.push({ ...currentJob }); currentJob = {}; }
    }
    return jobs.length > 0 ? jobs : null;
  } catch { return null; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function handleChat(req, res) {
  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
  try {
    const { messages } = JSON.parse(body);
    const lastMsg = messages[messages.length - 1]?.content || "";
    const keywords = lastMsg.match(/\b(informatique|comptable|ingénieur|commercial|médecin|infirmier|enseignant|électricien|logistique|RH|marketing|développeur|web|مهندس|محاسب|تجاري|مبرمج|offre|emploi)\b/gi);
    const liveJobs = await fetchAnapecJobs(keywords?.[0] || "");
    const jobsContext = liveJobs?.length > 0
      ? `\n\n--- OFFRES ANAPEC EN TEMPS RÉEL ---\n` + liveJobs.map((j, i) => `${i + 1}. ${j.title}${j.company ? ` — ${j.company}` : ""}`).join("\n") + `\nhttps://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`
      : `\n\n--- SECTEURS ANAPEC ---\n` + ANAPEC_SECTORS.map((j, i) => `${i + 1}. ${j.title} | ${j.region} | ${j.contrat}`).join("\n") + `\nhttps://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`;

    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
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
}

function handleStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  if (filePath === '/admin') filePath = '/admin.html';
  if (filePath === '/espace') filePath = '/espace.html';
  filePath = path.join(__dirname, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Fallback to index.html for SPA routing
      fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}

// Main request handler (used by both local HTTP server and Vercel)
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'POST' && req.url === '/api/chat') {
    return handleChat(req, res);
  }
  handleStatic(req, res);
}

// Vercel serverless export
export default handler;

// Local HTTP server only — Vercel uses the export default above
if (!process.env.VERCEL && process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createServer } = await import('http');
  const PORT = process.env.PORT || 3000;
  createServer(handler).listen(PORT, () =>
    console.log(`\n✅ PALE-UCA → http://localhost:${PORT}\n`)
  );
}
