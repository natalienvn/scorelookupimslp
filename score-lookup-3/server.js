const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── IMSLP MediaWiki API ─────────────────────────────────────────────────────

const IMSLP_API = "https://imslp.org/w/api.php";

async function imslpSearch(query, limit = 5) {
  const url = new URL(IMSLP_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("format", "json");

  console.log("[IMSLP Search]", query);

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "ScoreLookup/2.1 (IMSLP public domain checker)",
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    console.error("[IMSLP Error]", res.status, res.statusText);
    throw new Error(`IMSLP API returned ${res.status}`);
  }

  const data = await res.json();
  return (data.query?.search || []).map((item) => ({
    title: item.title,
    snippet: item.snippet
      .replace(/<[^>]*>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'"),
    link: `https://imslp.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
  }));
}

async function imslpGetPage(title) {
  const url = new URL(IMSLP_API);
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", title);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "ScoreLookup/2.1 (IMSLP public domain checker)",
      "Accept": "application/json",
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.parse?.wikitext?.["*"] || null;
}

// ── Copyright parsing ───────────────────────────────────────────────────────

function parseCopyrightFromWikitext(wikitext) {
  if (!wikitext) return { statuses: [], composerDates: null };

  const statuses = [];
  const copyrightMatches = wikitext.match(/\|Copyright\s*=\s*([^\n|}]+)/gi);
  if (copyrightMatches) {
    for (const m of copyrightMatches) {
      const val = m.replace(/\|Copyright\s*=\s*/i, "").trim();
      if (val && !statuses.includes(val)) statuses.push(val);
    }
  }

  let composerDates = null;
  const deathMatch = wikitext.match(/\|Death\s*=\s*(\d{4})/i);
  const birthMatch = wikitext.match(/\|Born\s*=\s*(\d{4})/i);
  if (deathMatch) {
    composerDates = {
      birth: birthMatch ? parseInt(birthMatch[1]) : null,
      death: parseInt(deathMatch[1]),
    };
  }
  if (!composerDates) {
    const dateMatch = wikitext.match(/\((\d{4})\s*[-–]\s*(\d{4})\)/);
    if (dateMatch) {
      composerDates = { birth: parseInt(dateMatch[1]), death: parseInt(dateMatch[2]) };
    }
  }

  return { statuses, composerDates };
}

function analyzeCopyright(statuses, composerDates) {
  const currentYear = new Date().getFullYear();
  const details = [];
  let verdict = "UNKNOWN";

  const hasPD = statuses.some((s) => /public\s*domain/i.test(s));
  const hasNonPD = statuses.some((s) => /non.*public\s*domain|copyrighted/i.test(s));
  const hasCC = statuses.some((s) => /creative\s*commons/i.test(s));

  if (hasPD && !hasNonPD) {
    verdict = "YES";
    details.push("Tagged as Public Domain on IMSLP.");
  } else if (hasPD && hasNonPD) {
    verdict = "PARTIALLY";
    details.push("Some editions are Public Domain, others remain under copyright.");
  } else if (hasCC) {
    verdict = "OPEN LICENSE";
    details.push("Available under a Creative Commons license.");
  } else if (hasNonPD) {
    verdict = "NO";
    details.push("Tagged as copyrighted on IMSLP.");
  }

  if (composerDates && composerDates.death) {
    const yearsSinceDeath = currentYear - composerDates.death;
    const dates = composerDates.birth
      ? `(${composerDates.birth}–${composerDates.death})`
      : `(d. ${composerDates.death})`;

    if (yearsSinceDeath > 70) {
      details.push(`Composer ${dates} died over 70 years ago — original works are public domain in most countries.`);
      if (verdict === "UNKNOWN") verdict = "LIKELY YES";
    } else if (yearsSinceDeath > 50) {
      details.push(`Composer ${dates} died ${yearsSinceDeath} years ago — PD in life+50 countries but NOT in life+70 countries (US, EU).`);
      if (verdict === "UNKNOWN") verdict = "DEPENDS ON COUNTRY";
    } else {
      details.push(`Composer ${dates} died only ${yearsSinceDeath} years ago — likely still under copyright.`);
      if (verdict === "UNKNOWN") verdict = "LIKELY NO";
    }
  }

  if (verdict === "UNKNOWN") {
    details.push("Could not determine copyright status. Check the IMSLP page directly.");
  }

  details.push("Note: Specific editions and arrangements may have separate copyright.");
  return { verdict, details };
}

// ── Local query expansion (free, always works) ──────────────────────────────

function localExpand(query) {
  const q = query.trim();
  const variations = new Set();
  variations.add(q);

  // Normalize "op." / "opus" — e.g. "Beethoven op. 90" → "Beethoven Op. 90"
  if (/\bop\.?\s*\d/i.test(q)) {
    variations.add(q.replace(/\bop\.?\s*/i, "Op. "));
    variations.add(q.replace(/\bop\.?\s*/i, "Opus "));
  }

  // Normalize "no."
  if (/\bno\.?\s*\d/i.test(q)) {
    variations.add(q.replace(/\bno\.?\s*/i, "No. "));
    variations.add(q.replace(/\bno\.?\s*/i, "No."));
  }

  // Try just the composer name (first word if multi-word)
  const words = q.split(/\s+/);
  if (words.length >= 2) {
    variations.add(words[0]);
  }

  // Try swapping number formats: "6 sonata" → "Sonata No. 6"
  const numMatch = q.match(/\b(\d+)\b/);
  if (numMatch) {
    const num = numMatch[1];
    const types = ["Sonata", "Symphony", "Concerto", "Quartet", "Trio", "Suite",
      "Prelude", "Etude", "Nocturne", "Ballade", "Waltz", "Mazurka", "Polonaise",
      "Rhapsody", "Fantasia", "Fugue", "Overture", "Serenade", "Impromptu", "Scherzo"];

    // Check if the query already contains a work type
    const foundType = types.find((t) => q.toLowerCase().includes(t.toLowerCase()));
    if (foundType) {
      // "ysaye 6 sonata" → "Sonata No. 6 Ysaÿe"
      const composerPart = q.replace(/\d+/g, "").replace(new RegExp(foundType, "i"), "").trim();
      variations.add(`${foundType} No. ${num} ${composerPart}`);
      variations.add(`${composerPart} ${foundType} No. ${num}`);
      variations.add(`${composerPart} ${foundType}`);
    } else {
      // No work type found — try common ones
      const composer = words.find((w) => !/^\d+$/.test(w)) || words[0];
      variations.add(`${composer} Sonata No. ${num}`);
      variations.add(`${composer} Symphony No. ${num}`);
      variations.add(`${composer} Concerto No. ${num}`);
    }
  }

  return [...variations];
}

// ── Haiku call for smart expansion ──────────────────────────────────────────

async function haikuExpand(userQuery) {
  if (!API_KEY) {
    console.log("[Haiku] No API key — skipping");
    return [];
  }

  try {
    console.log("[Haiku] Expanding:", userQuery);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 250,
        system: `Generate IMSLP search queries. IMSLP titles look like: "Piano Sonata No.27 (Beethoven, Ludwig van)" or "Boléro, M.81 (Ravel, Maurice)".

Given user input, return a JSON array of 5 search strings. Include the formal IMSLP-style title, opus/catalog numbers, and the composer's full name in "Last, First" format.

ONLY output a JSON array. No markdown, no backticks, no explanation.`,
        messages: [{ role: "user", content: userQuery }],
      }),
    });

    const data = await res.json();

    if (data.error) {
      console.error("[Haiku Error]", data.error.message);
      return [];
    }

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const variations = JSON.parse(cleaned);

    if (Array.isArray(variations)) {
      console.log("[Haiku] Variations:", variations);
      return variations;
    }
    return [];
  } catch (err) {
    console.error("[Haiku] Failed:", err.message);
    return [];
  }
}

// ── Combined search ─────────────────────────────────────────────────────────

async function smartSearch(query, limit = 8) {
  // Run local expansion immediately, Haiku in parallel
  const localVariations = localExpand(query);
  const haikuVariations = await haikuExpand(query);

  // Haiku first (smarter), then local fallbacks
  const allVariations = [...new Set([...haikuVariations, ...localVariations])];
  console.log("[Search] Total variations:", allVariations.length, allVariations);

  const seen = new Set();
  const allResults = [];

  for (const v of allVariations) {
    if (allResults.length >= limit) break;

    try {
      const results = await imslpSearch(v, 4);
      for (const r of results) {
        if (!seen.has(r.title)) {
          seen.add(r.title);
          allResults.push(r);
        }
      }
    } catch (err) {
      console.error("[Search] Variation failed:", v, "-", err.message);
    }
  }

  console.log("[Search] Total results:", allResults.length);
  return allResults.slice(0, limit);
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", hasApiKey: !!API_KEY, version: "2.1" });
});

app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const results = await smartSearch(q);
    res.json({ results });
  } catch (err) {
    console.error("[/api/search]", err);
    res.status(500).json({ error: "Failed to search IMSLP. Please try again." });
  }
});

app.get("/api/copyright", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });

  try {
    const searchResults = await smartSearch(q, 5);

    if (searchResults.length === 0) {
      return res.json({
        results: [],
        message: `No results found on IMSLP for "${q}". Try "Composer Last Name + Work Title" (e.g. "Beethoven Piano Sonata No. 27").`,
      });
    }

    const results = [];
    for (const item of searchResults.slice(0, 3)) {
      try {
        const wikitext = await imslpGetPage(item.title);
        const { statuses, composerDates } = parseCopyrightFromWikitext(wikitext);
        const analysis = analyzeCopyright(statuses, composerDates);
        results.push({ title: item.title, link: item.link, verdict: analysis.verdict, details: analysis.details });
      } catch (parseErr) {
        results.push({ title: item.title, link: item.link, verdict: "UNKNOWN", details: ["Could not retrieve details. Visit the IMSLP page directly."] });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("[/api/copyright]", err);
    res.status(500).json({ error: "Failed to check copyright. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`Score Lookup v2.1 running at http://localhost:${PORT}`);
  console.log(`Anthropic API key configured: ${!!API_KEY}`);
});
