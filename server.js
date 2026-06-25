import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const SYSTEM_PROMPT = `أنت مساعد ذكي لمنصة DabaNet، منصة مغربية لمواكبة الخريجين الباحثين عن عمل.
مهمتك مساعدة المستخدمين في:
- تحسين ملفهم المهني والسيرة الذاتية
- البحث عن فرص عمل وتكوينات من ANAPEC
- التوجيه المهني والجامعي
- نصائح التحضير للمقابلات
- تطوير المهارات المطلوبة في سوق الشغل المغربي

أجب دائماً بالعربية ما لم يتحدث المستخدم بالفرنسية. كن ودوداً، مشجعاً، وعملياً في نصائحك.
اجعل ردودك موجزة (3-5 جمل) إلا إذا طُلب منك التفصيل.`;

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
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
        if (!process.env.GROQ_API_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'GROQ_API_KEY manquant dans .env' }));
        }
        const response = await client.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          max_tokens: 512,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
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
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ DabaNet MVP → http://localhost:${PORT}\n`);
  if (!process.env.GROQ_API_KEY) {
    console.warn('⚠️  GROQ_API_KEY manquant — ajoutez-le dans .env\n');
  }
});
