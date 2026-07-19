// server.js
// Ideas SHOP — Messenger AI কাস্টমার সাপোর্ট বট
// Facebook Messenger Webhook + AI (Gemini/OpenAI সুইচেবল) + Product/Delivery Knowledge Base

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const { getSystemPrompt } = require("./knowledgeBase");
const { askAI } = require("./aiProvider");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

// প্রতিটা ইউজারের সাম্প্রতিক কথোপকথন মেমোরিতে রাখা হচ্ছে (সার্ভার রিস্টার্ট হলে মুছে যাবে)
// বড় স্কেলে গেলে এটাকে Google Sheets/DB-তে সরিয়ে নেওয়া ভালো
const conversationHistory = new Map();
const MAX_HISTORY_TURNS = 6; // প্রতি ইউজারের শেষ ৬টা মেসেজ-রিপ্লাই মনে রাখবে

// ---------- ১. Webhook Verification (Facebook প্রথমবার এইটা কল করে) ----------
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---------- ২. Incoming Messages Handler ----------
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // দ্রুত 200 রেসপন্স পাঠিয়ে দিচ্ছি, Facebook 20 সেকেন্ডের মধ্যে উত্তর না পেলে রিট্রাই করে
  res.status(200).send("EVENT_RECEIVED");

  if (body.object !== "page") return;

  for (const entry of body.entry || []) {
    const event = entry.messaging?.[0];
    if (!event) continue;

    const senderId = event.sender?.id;
    const messageText = event.message?.text;

    // ইমেজ/স্টিকার/ইকো মেসেজ হলে স্কিপ করবে
    if (!senderId || !messageText || event.message?.is_echo) continue;

    try {
      await handleUserMessage(senderId, messageText);
    } catch (err) {
      console.error("❌ Error handling message:", err?.response?.data || err.message);
      await sendMessage(
        senderId,
        "দুঃখিত, একটু সমস্যা হচ্ছে। একটু পরে আবার মেসেজ করুন 🙏"
      );
    }
  }
});

// ---------- ৩. মূল লজিক: মেসেজ প্রসেস করে AI দিয়ে রিপ্লাই বানানো ----------
async function handleUserMessage(senderId, messageText) {
  // টাইপিং ইন্ডিকেটর দেখানো (ঐচ্ছিক কিন্তু কাস্টমার এক্সপেরিয়েন্স ভালো করে)
  await sendTypingIndicator(senderId);

  const history = conversationHistory.get(senderId) || [];

  const systemPrompt = await getSystemPrompt();

  const aiReply = await askAI({
    systemPrompt,
    history,
    userMessage: messageText,
  });

  // হিস্টরি আপডেট করা (limited length রাখা হচ্ছে যাতে টোকেন খরচ কম হয়)
  history.push({ role: "user", text: messageText });
  history.push({ role: "assistant", text: aiReply });
  while (history.length > MAX_HISTORY_TURNS * 2) history.shift();
  conversationHistory.set(senderId, history);

  await sendMessage(senderId, aiReply);
}

// ---------- ৪. Facebook Send API দিয়ে রিপ্লাই পাঠানো ----------
async function sendMessage(recipientId, text) {
  // Facebook-এর ২০০০ ক্যারেক্টার লিমিট আছে প্রতি মেসেজে
  const chunks = splitMessage(text, 1900);

  for (const chunk of chunks) {
    await axios.post(
      `https://graph.facebook.com/v20.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: chunk },
      },
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
  }
}

async function sendTypingIndicator(recipientId) {
  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/me/messages`,
      {
        recipient: { id: recipientId },
        sender_action: "typing_on",
      },
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
  } catch (e) {
    // টাইপিং ইন্ডিকেটর ফেইল করলেও সমস্যা নেই, মূল রিপ্লাই ঠিকই যাবে
  }
}

function splitMessage(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    parts.push(remaining.slice(0, maxLen));
    remaining = remaining.slice(maxLen);
  }
  if (remaining.length) parts.push(remaining);
  return parts;
}

// ---------- Health check (Render-এ পিং করার জন্য) ----------
app.get("/", (req, res) => res.send("Ideas SHOP Messenger AI Bot is running ✅"));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
