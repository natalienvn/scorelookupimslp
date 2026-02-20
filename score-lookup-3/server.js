const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

// IMSLP MCP server URL — provides google_search, imslp_get_page_editions, imslp_get_composer
const IMSLP_MCP_URL = "https://ks6.imslp.org:5821/mcp/tools/google_search,imslp_get_page_editions,imslp_get_composer";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getPrompts() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const year = now.getFullYear();

  return {
    pd: {
      model: "claude-sonnet-4-5-20250929",
      system: `You are a concise, authoritative copyright expert for classical music. You have access to IMSLP tools.

For each query:
1. Use google_search to find the IMSLP page (search "site:imslp.org" + the query)
2. Use imslp_get_page_editions to get edition/copyright details from the page
3. If needed, use imslp_get_composer for composer birth/death dates

Then determine public domain status using these rules:

US COPYRIGHT (different from the rest of the world):
- The US does NOT use life+70 for older works. The US uses publication-based rules.
- Works published before 1929: public domain in the US.
- Works published 1929-1977: protected for 95 years from publication date.
- Works published after 1977: life of author + 70 years.

EU/UK/AUSTRALIA (life+70): Composer died 70+ years ago = PD.
CANADA/CHINA/JAPAN/SOUTH AFRICA/NEW ZEALAND (life+50): Composer died 50+ years ago = PD.

TODAY IS ${dateStr}. The current year is ${year}. Any date before today HAS ALREADY PASSED.

RESPONSE FORMAT:
1. Write 2-3 sentences explaining the copyright status. Be specific about dates and countries.
2. End with a verdict on its own line: VERDICT: YES / VERDICT: NO / VERDICT: IT DEPENDS
   - YES = PD everywhere now
   - NO = not PD anywhere now
   - IT DEPENDS = PD in some countries but not others right now

Do not use bullet points, markdown, or links. NEVER change your mind mid-response.`,
    },
    imslp: {
      model: "claude-sonnet-4-5-20250929",
      system: `You are an IMSLP assistant. For each user query, use MCP tools to find the best IMSLP match and reply normally.

Prefer work pages first (via google_search + imslp_get_page_editions), then composer pages (imslp_get_composer) if no work page is found.

For google_search, always prefix your query with "site:imslp.org".

When you find the work, report:
- Whether it exists on IMSLP (start with YES or NO)
- What's available (scores, parts, recordings, arrangements)
- If the composer died less than 70 years ago, add: "Note: this work may still be under copyright in many countries — check the licensing on each file before downloading."

Do NOT include URLs or links. Give ONE confident answer in 2-3 sentences.
Do not use bullet points or markdown.`,
    },
  };
}

// ── API call with MCP connector ─────────────────────────────────────────────

async function callWithMCP(model, system, userQuery) {
  console.log(`[API] Calling ${model} with MCP connector`);

  const body = {
    model,
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: userQuery }],
    mcp_servers: [
      {
        type: "url",
        url: IMSLP_MCP_URL,
        name: "imslp",
      },
    ],
    tools: [
      {
        type: "mcp_toolset",
        mcp_server_name: "imslp",
      },
    ],
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-11-20",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.error) {
    console.error("[API Error]", data.error.message);
    throw new Error(data.error.message);
  }

  // Extract text from response (Claude handles all tool calls internally)
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();

  console.log("[API] Response:", text.slice(0, 200));
  return text;
}

// ── Routes ───────────────────────────────────────────────────────────────────

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
    let result = await callWithMCP(config.model, config.system, query);

    // For PD mode: extract VERDICT from end, move to front
    if (mode === "pd") {
      const verdictMatch = result.match(/VERDICT:\s*(YES|NO|IT DEPENDS)\.?$/i);
      if (verdictMatch) {
        const verdict = verdictMatch[1].toUpperCase();
        const explanation = result.replace(/\s*VERDICT:\s*(YES|NO|IT DEPENDS)\.?\s*$/i, "").trim();
        result = verdict + ". " + explanation;
      }
    }

    res.json({ result: result || "No answer returned. Try rephrasing your query." });
  } catch (err) {
    console.error("[Server Error]", err);
    res.status(500).json({ error: "Failed to process your request. Please try again." });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasApiKey: !!API_KEY, version: "4.0-mcp" });
});

app.listen(PORT, () => {
  console.log(`Score Lookup v4 (MCP) running at http://localhost:${PORT}`);
  console.log(`API key configured: ${!!API_KEY}`);
  console.log(`IMSLP MCP: ${IMSLP_MCP_URL}`);
});
