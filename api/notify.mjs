const WA_API = "https://graph.facebook.com/v20.0";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const { phone, type, data } = req.body;
  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_ID;

  if (!token || !phoneId) {
    res.status(500).json({ error: "WhatsApp API not configured" });
    return;
  }
  if (!phone) {
    res.status(400).json({ error: "phone number required" });
    return;
  }

  // Normalize phone: remove spaces/dashes, ensure country code
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, "").replace(/^0/, "212");

  let message;

  if (type === "job_alert") {
    // Custom text message (only works if user sent us a message in last 24h)
    // OR use a pre-approved template
    message = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: {
        body: `🎯 *PALUCA — Nouvelle offre pour vous*\n\n${data?.title || "Offre ANAPEC"}\n📍 ${data?.region || "Maroc"}\n📋 ${data?.contrat || "CDI/CDD"}\n\n👉 Consultez les offres : https://www.anapec.org/sigec-app-rv/front/chercheurs/recherche_offre\n\n_Répondez à ce message pour continuer avec notre assistant._`
      }
    };
  } else if (type === "welcome") {
    // Use the pre-approved hello_world template for first contact
    message = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" }
      }
    };
  } else {
    // Default: job subscription confirmation
    message = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: {
        body: `✅ *PALUCA — Inscription confirmée*\n\nBonjour ! Vous êtes maintenant inscrit aux alertes emploi PALUCA.\n\nVous recevrez des notifications quand de nouvelles offres ANAPEC correspondant à votre profil seront disponibles.\n\n_Répondez à ce message pour parler à notre assistant IA._`
      }
    };
  }

  try {
    const response = await fetch(`${WA_API}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("WhatsApp API error:", result);
      res.status(response.status).json({ error: result.error?.message || "WhatsApp API error" });
      return;
    }

    res.status(200).json({ success: true, messageId: result.messages?.[0]?.id });
  } catch (err) {
    console.error("Notify error:", err);
    res.status(500).json({ error: err.message });
  }
}
