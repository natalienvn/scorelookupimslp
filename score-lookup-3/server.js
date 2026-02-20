const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getPrompts() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const year = now.getFullYear();

  return {
    pd: {
      model: "claude-sonnet-4-5-20250929",
      system: `You are a concise, authoritative copyright expert for classical music. Given a composer, work, or edition, determine if it's in the public domain.

Rules — FOLLOW THESE EXACTLY:

US COPYRIGHT (different from the rest of the world):
- The US does NOT use life+70 for older works. The US uses publication-based rules.
- Works published before 1929: public domain in the US.
- Works published 1929-1977: protected for 95 years from publication date.
- Works published after 1977: life of author + 70 years.
- NEVER group the US with "life+70 countries" — the US rule is DIFFERENT.

EU/UK/AUSTRALIA (life+70 countries):
- Composer died 70+ years ago = public domain.

CANADA/CHINA/JAPAN/SOUTH AFRICA/NEW ZEALAND (life+50 countries):
- Composer died 50+ years ago = public domain.

Arrangements and editions have their OWN separate copyright.

TODAY IS ${dateStr}. The current year is ${year}. Any date before today HAS ALREADY PASSED.

RESPONSE FORMAT:
1. First, write 2-3 sentences explaining the copyright status in different countries/regions. Be specific about dates.
2. End with a FINAL VERDICT on its own line, chosen from: VERDICT: YES / VERDICT: NO / VERDICT: IT DEPENDS
3. Choose the verdict based on your COMPLETE analysis:
   - VERDICT: YES if your analysis shows it's PD everywhere now
   - VERDICT: NO if it's not PD anywhere now
   - VERDICT: IT DEPENDS if it's PD in some countries but NOT others RIGHT NOW

CRITICAL: NEVER change your mind mid-response. NEVER say "wait". Do all calculations silently before writing.
Do not use bullet points, markdown, or links.`,
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

Do NOT include any URLs or links. Just answer whether the work is on IMSLP and briefly what's available.

IMPORTANT: If the composer died LESS than 70 years ago (e.g. Shostakovich, Prokofiev, Bartók, Britten, Copland, Barber, Bernstein, etc.), add a short note at the end: "Note: this work may still be under copyright in many countries — check the licensing on each file before downloading."

CRITICAL: Give ONE confident answer. Never change your mind mid-response.
Answer in 2-3 sentences. Start with YES or NO. Do not use bullet points or markdown.`,
    },
  };
}

app.post("/api/check", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured." });
  }

  const { query, mode } = req.body;
  const prompts = getPrompts();
  if (!query || !mode || !prompts[mode]) {
    return res.status(400).json({ error: "Invalid request." });
  }

  const config = prompts[mode];

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

    // For PD mode: extract VERDICT from end, move to front
    let result = text;
    if (mode === "pd") {
      const verdictMatch = text.match(/VERDICT:\s*(YES|NO|IT DEPENDS)\.?$/i);
      if (verdictMatch) {
        const verdict = verdictMatch[1].toUpperCase();
        const explanation = text.replace(/\s*VERDICT:\s*(YES|NO|IT DEPENDS)\.?\s*$/i, "").trim();
        result = verdict + ". " + explanation;
      }
    }

    res.json({ result: result || "No answer returned. Try rephrasing your query." });
  } catch (err) {
    console.error("[Server Error]", err);
    res.status(500).json({ error: "Failed to reach the AI service. Please try again." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasApiKey: !!API_KEY, version: "3.1" });
});

app.listen(PORT, () => {
  console.log(`Score Lookup v3.1 running at http://localhost:${PORT}`);
  console.log(`API key configured: ${!!API_KEY}`);
});
