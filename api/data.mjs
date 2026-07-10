import { put, list } from "@vercel/blob";

// Shared database for the DabaNet prototype, stored as JSON blobs.
// GET  /api/data           → { rdvs, profils, news, ateliers, inscriptions }
// POST /api/data {key,value} → saves one collection
const KEYS = ["rdvs", "profils", "news", "ateliers", "inscriptions"];

async function readAll() {
  const data = { rdvs: [], profils: [], news: [], ateliers: [], inscriptions: [] };
  const { blobs } = await list({ prefix: "db/" });
  await Promise.all(
    blobs.map(async (b) => {
      const key = b.pathname.replace(/^db\//, "").replace(/\.json$/, "");
      if (!KEYS.includes(key)) return;
      try {
        const res = await fetch(b.url, { cache: "no-store" });
        if (res.ok) data[key] = await res.json();
      } catch {}
    })
  );
  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(500).json({ error: "Blob storage not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const data = await readAll();
      res.status(200).json(data);
      return;
    }

    if (req.method === "POST") {
      const { key, value } = req.body || {};
      if (!KEYS.includes(key) || !Array.isArray(value)) {
        res.status(400).json({ error: "key must be one of " + KEYS.join(", ") + " and value must be an array" });
        return;
      }
      // Cap size to keep the prototype healthy
      const trimmed = value.slice(-500);
      await put(`db/${key}.json`, JSON.stringify(trimmed), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      });
      res.status(200).json({ success: true, key, count: trimmed.length });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("data api error:", err);
    res.status(500).json({ error: err.message });
  }
}
