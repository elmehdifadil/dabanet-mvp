import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `أنت مساعد ذكي لمنصة DabaNet، منصة مغربية لمواكبة الخريجين الباحثين عن عمل.
مهمتك مساعدة المستخدمين في:
- تحسين ملفهم المهني والسيرة الذاتية
- البحث عن فرص عمل وتكوينات من ANAPEC
- التوجيه المهني والجامعي
- نصائح التحضير للمقابلات
- تطوير المهارات المطلوبة في سوق الشغل المغربي

أجب دائماً بالعربية ما لم يتحدث المستخدم بالفرنسية. كن ودوداً، مشجعاً، وعملياً في نصائحك.
اجعل ردودك موجزة (3-5 جمل) إلا إذا طُلب منك التفصيل.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    res.status(200).json({ reply: response.content[0].text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في الاتصال بالمساعد الذكي" });
  }
}
