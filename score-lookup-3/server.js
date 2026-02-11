const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PROMPTS = {
  pd: {
    model: "claude-sonnet-4-5-20250929",
    system: `You are a concise, authoritative copyright expert for classical music. Given a composer, work, or edition, determine if it's in the public domain.

Rules:
- US: works published before 1929 are public domain. Works published 1929 enter PD on Jan 1, 2025 (95-year rule).
- International: composer died 70+ years ago = PD in most countries (life+70). Some countries use life+50 (Canada, etc.).
- Arrangements and editions have their OWN separate copyright.
- Today's date is February 2026.

CRITICAL INSTRUCTIONS:
- Give ONE confident, correct answer. NEVER change your mind mid-response. NEVER say "wait" or correct yourself.
- Think carefully BEFORE you write. If you need to calculate, do so silently. Only output your final, confident answer.
- Start with exactly one of: YES, NO, or IT DEPENDS.
- Answer in 2-3 sentences. Be specific about US vs international when relevant.
- Do not use bullet points, markdown, or links.`,
  },
  imslp: {
    model: "claude-haiku-4-5-20251001",
    system: `You are a helpful assistant that knows IMSLP (International Music Score Library Project / Petrucci Music Library) extremely well.

Given a query about a musical work, tell the user if it exists on IMSLP and what they'd find there.

Key facts:
- IMSLP has 700,000+ scores, 130,000+ works, 27,000+ composers
- It primarily hosts public domain scores but also Creative Commons works
- Most major classical works from before 1929 are on IMSLP
- Many copyrighted works also appear with legally available editions

Do NOT include any URLs or links. Just answer whether the work is on IMSLP and briefly what's available (scores, parts, recordings, arrangements, etc.).

CRITICAL: Give ONE confident answer. Never change your mind mid-response. Never say "wait" or correct yourself.
Answer in 2-3 sentences. Start with YES or NO. Do not use bullet points or markdown.`,
  },
};

app.post("/api/check", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured." });
  }

  const { query, mode } = req.body;
  if (!query || !mode || !PROMPTS[mode]) {
    return res.status(400).json({ error: "Invalid request." });
  }

  const config = PROMPTS[mode];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 400,
        system: config.system,
        messages: [{ role: "user", content: query }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[API Error]", data.error.message);
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    res.json({ result: text || "No answer returned. Try rephrasing your query." });
  } catch (err) {
    console.error("[Server Error]", err);
    res.status(500).json({ error: "Failed to reach the AI service. Please try again." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasApiKey: !!API_KEY, version: "3.0-haiku" });
});

app.listen(PORT, () => {
  console.log(`Score Lookup v3 running at http://localhost:${PORT}`);
  console.log(`API key configured: ${!!API_KEY}`);
});
