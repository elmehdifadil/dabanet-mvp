const WA_API = "https://graph.facebook.com/v20.0";
const SITE = "https://paluca.vercel.app";

// Builds the WhatsApp message body for each automatic notification type
function buildMessage(type, data = {}) {
  switch (type) {
    case "welcome_registration":
      return `✅ *PALE-UCA — Bienvenue ${data.nom || ""}* 🎓\n\nVotre compte a été créé avec succès sur PALE-UCA (Plateforme d'Accompagnement des Lauréats Universitaires Cadi Ayyad).\n\nVous recevrez ici :\n📅 Confirmations de vos rendez-vous conseiller\n💼 Offres d'emploi adaptées à votre profil\n🎓 Nouveaux ateliers et formations\n\n👉 Votre espace : ${SITE}`;

    case "rdv_accepted":
      return `📅 *PALE-UCA — Rendez-vous confirmé* ✅\n\nBonjour ${data.nom || ""},\nVotre rendez-vous avec un conseiller emploi a été *accepté* :\n\n🗓 Date : ${data.date || "—"}\n📞 Type : ${data.typeRdv || "—"}\n\nLe conseiller vous contactera à l'heure convenue. Bonne chance ! 🍀`;

    case "rdv_refused":
      return `📅 *PALE-UCA — Rendez-vous* ⚠️\n\nBonjour ${data.nom || ""},\nVotre demande de rendez-vous du ${data.date || "—"} n'a pas pu être retenue.\n\n👉 Vous pouvez proposer une nouvelle date depuis votre espace : ${SITE}`;

    case "atelier_new":
      return `🎓 *PALE-UCA — Nouvel atelier disponible*\n\n${data.t || "Atelier"}\n🗓 ${data.d || ""}\n📍 ${data.lieu || ""}\n🔥 ${data.places || "Places limitées"}\n\n👉 Inscrivez-vous vite depuis votre espace : ${SITE}`;

    case "news_new":
      return `📰 *PALE-UCA — Actualité*\n\n*${data.title || ""}*\n\n${data.desc || ""}\n\n👉 Plus de détails : ${SITE}`;

    case "job_alert":
      return `🎯 *PALE-UCA — Nouvelle offre pour vous*\n\n${data.title || "Offre ANAPEC"}\n📍 ${data.region || "Maroc"}\n📋 ${data.contrat || "CDI/CDD"}\n\n👉 Consultez les offres : https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre`;

    default:
      return `✅ *PALE-UCA — Notification*\n\nBonjour ! Vous êtes inscrit aux alertes PALE-UCA.\n👉 ${SITE}`;
  }
}

function normalizePhone(phone) {
  let p = String(phone).replace(/[\s\-\(\)\.]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "212" + p.slice(1);   // 06XXXXXXXX → 2126XXXXXXXX
  if (!p.startsWith("212") && p.length === 9) p = "212" + p; // 6XXXXXXXX
  return p;
}

async function sendOne(phoneId, token, phone, body) {
  const res = await fetch(`${WA_API}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizePhone(phone),
      type: "text",
      text: { body },
    }),
  });
  const result = await res.json();
  return { ok: res.ok, phone, id: result.messages?.[0]?.id, error: result.error?.message };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_ID;
  if (!token || !phoneId) {
    // Graceful degradation: the site keeps working until Meta keys are configured
    res.status(200).json({ success: false, skipped: true, reason: "WhatsApp API not configured (WA_TOKEN / WA_PHONE_ID missing)" });
    return;
  }

  const { phone, phones, type, data } = req.body || {};
  const targets = Array.isArray(phones) ? phones : (phone ? [phone] : []);
  if (targets.length === 0) { res.status(400).json({ error: "phone or phones[] required" }); return; }

  const body = buildMessage(type, data);

  try {
    // Broadcast capped at 20 recipients per call to stay within limits
    const results = await Promise.all(
      targets.slice(0, 20).filter(Boolean).map((p) => sendOne(phoneId, token, p, body))
    );
    const sent = results.filter((r) => r.ok).length;
    res.status(200).json({ success: sent > 0, sent, total: results.length, results });
  } catch (err) {
    console.error("Notify error:", err);
    res.status(500).json({ error: err.message });
  }
}
