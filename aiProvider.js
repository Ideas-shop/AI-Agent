// aiProvider.js
// AI প্রোভাইডার সুইচেবল — .env-এ AI_PROVIDER=gemini বা AI_PROVIDER=openai সেট করলেই বদলে যাবে
// এখন Gemini দিয়ে টেস্ট করছেন, পরে OpenAI credit নিলে শুধু .env বদলালেই চলবে, কোড বদলাতে হবে না

const axios = require("axios");

const PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ⚠️ IMPORTANT: gemini-2.0-flash 1 জুন, 2026-এ Google শাটডাউন করে দিয়েছে — সেটা ব্যবহার করলে
// প্রতিটা রিকোয়েস্টে এরর আসবে। এখন gemini-2.5-flash ব্যবহার করা হচ্ছে (অ্যাক্টিভ মডেল)।
// নোট: gemini-2.5-flash-ও ১৬ অক্টোবর, 2026-এ শাটডাউন হবে — তখন আবার .env-এ GEMINI_MODEL বদলে
// gemini-3.5-flash বা তখনকার latest stable মডেলে নিয়ে যেতে হবে।
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
// OpenAI-এর সবচেয়ে সস্তা মডেল (পরে ব্যবহার করবেন)
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-nano";

async function askAI({ systemPrompt, history, userMessage }) {
  if (PROVIDER === "openai") {
    return askOpenAI({ systemPrompt, history, userMessage });
  }
  return askGemini({ systemPrompt, history, userMessage });
}

// ---------- Gemini ----------
async function askGemini({ systemPrompt, history, userMessage }) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY সেট করা নেই");

  const contents = [
    ...history.map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.text }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await axios.post(url, {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
  });

  const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return reply?.trim() || "দুঃখিত, একটু বুঝতে পারিনি। আবার বলবেন কি?";
}

// ---------- OpenAI ----------
async function askOpenAI({ systemPrompt, history, userMessage }) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY সেট করা নেই");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: userMessage },
  ];

  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: OPENAI_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 500,
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const reply = res.data?.choices?.[0]?.message?.content;
  return reply?.trim() || "দুঃখিত, একটু বুঝতে পারিনি। আবার বলবেন কি?";
}

module.exports = { askAI };
