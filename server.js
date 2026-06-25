import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

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

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API route
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { messages } = JSON.parse(body);
        if (!process.env.ANTHROPIC_API_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY غير مضبوط. أضفه في ملف .env' }));
        }
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages,
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: response.content[0].text }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static files
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n✅ DabaNet MVP en marche → http://localhost:${PORT}\n`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY manquant — ajoutez-le dans le fichier .env\n');
  }
});
