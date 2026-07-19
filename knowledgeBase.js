// knowledgeBase.js
// দোকানের পলিসি + প্রোডাক্ট ডেটা দিয়ে AI-এর জন্য System Prompt বানায়

const axios = require("axios");

// ⚠️ এখানে আপনার আসল products.json-এর raw GitHub লিংক বসান
// উদাহরণ: https://raw.githubusercontent.com/USERNAME/REPO/main/products.json
const PRODUCTS_JSON_URL = process.env.PRODUCTS_JSON_URL || "";

// প্রোডাক্ট ডেটা বারবার ফেচ না করে ৫ মিনিট ক্যাশে রাখা হচ্ছে (রেট লিমিট/স্পিডের জন্য ভালো)
let cachedProducts = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // ৫ মিনিট

async function getProducts() {
  const now = Date.now();
  if (cachedProducts && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProducts;
  }
  if (!PRODUCTS_JSON_URL) {
    return [];
  }
  try {
    const res = await axios.get(PRODUCTS_JSON_URL, {
      params: { t: now }, // cache-busting
      timeout: 8000,
    });
    cachedProducts = Array.isArray(res.data) ? res.data : res.data.products || [];
    cacheTimestamp = now;
    return cachedProducts;
  } catch (err) {
    console.error("⚠️ Products fetch failed:", err.message);
    return cachedProducts || []; // ফেচ ফেইল করলে পুরনো ক্যাশ থাকলে সেটাই ব্যবহার করবে
  }
}

// প্রোডাক্ট লিস্টকে AI-এর জন্য সংক্ষিপ্ত readable ফরম্যাটে সাজানো
// (পুরো JSON দিলে টোকেন খরচ বেশি হয়ে যায়, তাই দরকারি ফিল্ডগুলো বাছাই করা হচ্ছে)
function formatProductsForPrompt(products) {
  if (!products.length) {
    return "এই মুহূর্তে প্রোডাক্ট তালিকা লোড করা যায়নি। কাস্টমারকে বলুন সরাসরি ওয়েবসাইট tashurabd.shop চেক করতে বা কিছুক্ষণ পর আবার জিজ্ঞাসা করতে।";
  }
  return products
    .slice(0, 200) // অনেক বড় লিস্ট হলে টোকেন বাঁচাতে সীমা রাখা হচ্ছে
    .map((p) => {
      const name = p.name || p.title || "নাম নেই";
      const price = p.price || p.regularPrice || "মূল্য জানা নেই";
      const category = p.category || "";
      const code = p.code || p.productCode || "";
      const stock = p.stock !== undefined ? (p.stock > 0 ? "স্টকে আছে" : "স্টক আউট") : "";
      return `- ${name} | কোড: ${code} | দাম: ৳${price} | ক্যাটাগরি: ${category} ${stock ? "| " + stock : ""}`;
    })
    .join("\n");
}

const SHOP_POLICY = `
দোকানের নাম: Ideas SHOP (ওয়েবসাইট: tashurabd.shop)

ডেলিভারি পলিসি:
- নীলফামারী সদরের ভেতরে ডেলিভারি চার্জ: ৩০ টাকা
- সারা বাংলাদেশে (নীলফামারী সদরের বাইরে): ডেলিভারি চার্জ ১১০ টাকা
- পেমেন্ট মেথড: শুধু ক্যাশ অন ডেলিভারি (COD) — প্রোডাক্ট হাতে পেয়ে টাকা দিতে হবে

রিটার্ন/এক্সচেঞ্জ পলিসি:
- প্রোডাক্ট রিসিভ করার সাথে সাথে কোনো সমস্যা পাওয়া গেলে তখনই রিটার্ন/এক্সচেঞ্জ করা যাবে
- অনেক প্রোডাক্টে ৭ দিনের রিপ্লেসমেন্ট ওয়ারেন্টি আছে (প্রোডাক্ট অনুযায়ী ভিন্ন হতে পারে)
`;

async function getSystemPrompt() {
  const products = await getProducts();
  const productList = formatProductsForPrompt(products);

  return `তুমি "Ideas SHOP" ফেসবুক পেজের একজন বন্ধুত্বপূর্ণ কাস্টমার সাপোর্ট এজেন্ট।

তোমার কাজ:
- কাস্টমারের প্রশ্নের সহজ, স্পষ্ট, আন্তরিক বাংলা ভাষায় উত্তর দেওয়া
- প্রোডাক্ট, দাম, স্টক, ডেলিভারি চার্জ, রিটার্ন পলিসি নিয়ে প্রশ্নের উত্তর নিচের তথ্য দেখে দেওয়া
- অর্ডার করতে চাইলে ওয়েবসাইট tashurabd.shop থেকে অর্ডার করতে বলা, অথবা প্রয়োজনীয় তথ্য (নাম, ঠিকানা, ফোন নম্বর, প্রোডাক্ট) জিজ্ঞেস করা
- তুমি যা জানো না বা কনফার্ম না, সেটা নিয়ে অনুমান করে বলবে না — বরং বলবে পেজ এডমিন একটু পরে জানাবে
- উত্তর সংক্ষিপ্ত ও কথোপকথনের মতো রাখবে, রোবটিক লম্বা প্যারাগ্রাফ না

--- দোকানের পলিসি ---
${SHOP_POLICY}

--- বর্তমান প্রোডাক্ট তালিকা (সংক্ষিপ্ত) ---
${productList}
`;
}

module.exports = { getSystemPrompt };
