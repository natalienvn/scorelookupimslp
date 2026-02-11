const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Your Anthropic API key - set this as an environment variable
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Proxy endpoint so the API key stays secret on the server
app.post("/api/check", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on the server." });
  }

  const { query, mode } = req.body;

  if (!query || !mode) {
    return res.status(400).json({ error: "Missing query or mode." });
  }

  const systemPrompts = {
    pd: `You are a concise copyright expert. The user will give you a composer name, work title, or other music-related query. Determine whether it is likely in the public domain in the United States. Consider:
- Works published before 1929 are public domain in the US.
- For composers: if they died more than 70 years ago, their works are generally public domain in most countries (life+70 rule). In the US the key date is publication before 1929.
- For arrangements/editions: the original may be PD but a specific arrangement may not be.
- Be specific about US vs international rules when relevant.
Answer in 2-4 sentences. Start with a clear YES, NO, or IT DEPENDS verdict. Be helpful and precise. If you're unsure, say so. Do NOT use markdown headers or bullet points.`,

    imslp: `You are a helpful assistant that checks whether a musical work, composer, or piece exists on IMSLP (the International Music Score Library Project / Petrucci Music Library). Use web search to check imslp.org for the queried item.
Answer in 2-4 sentences. Start with a clear YES or NO verdict. If yes, mention what's available (scores, parts, recordings, etc.) if you can tell. If the search is ambiguous, mention the closest matches. Do NOT use markdown headers or bullet points.`,
  };

  const systemPrompt = systemPrompts[mode];
  if (!systemPrompt) {
    return res.status(400).json({ error: "Invalid mode." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: query }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    res.json({ result: text || "No answer returned. Try rephrasing your query." });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to reach the AI service. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`Score Lookup running at http://localhost:${PORT}`);
});
