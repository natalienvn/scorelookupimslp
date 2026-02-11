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
- US: works published before 1929 are public domain. Works published 1929-1977 are protected for 95 years from publication date.
- Life+70 countries (US, EU, UK, Australia, etc.): composer must have died 70+ years ago for PD.
- Life+50 countries (Canada, China, South Africa, New Zealand, Japan, etc.): composer must have died 50+ years ago for PD.
- If a composer died between 50 and 70 years ago: the work IS public domain in life+50 countries but NOT in life+70 countries. This is an IT DEPENDS case — you MUST say IT DEPENDS and explain both sides.
- If a composer died MORE than 70 years ago: the work is public domain virtually everywhere. Say YES.
- If a composer died LESS than 50 years ago: the work is not public domain anywhere. Say NO.
- Arrangements and editions have their OWN separate copyright independent of the original composition.
- Today's date is February 2026.

CRITICAL INSTRUCTIONS:
- Give ONE confident, correct answer. NEVER change your mind mid-response. NEVER say "wait" or correct yourself.
- Think carefully BEFORE you write. Do all calculations silently. Only output your final answer.
- Start with exactly one of: YES, NO, or IT DEPENDS.
- Answer in 2-4 sentences. Be specific about which countries.
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
- Works by composers who died less than 70 years ago may still be under copyright

Do NOT include any URLs or links. Just answer whether the work is on IMSLP and briefly what's available (scores, parts, recordings, arrangements, etc.).

IMPORTANT: If the composer died LESS than 70 years ago (e.g. Shostakovich, Prokofiev, Bartók, Britten, Copland, Barber, Bernstein, etc.), add a short note at the end: "Note: this work may still be under copyright in many countries — check the licensing on each file before downloading."

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
