const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── IMSLP MediaWiki API helpers ─────────────────────────────────────────────

const IMSLP_API = "https://imslp.org/w/api.php";

async function imslpSearch(query, limit = 5) {
  const url = new URL(IMSLP_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", query);
  url.searchParams.set("srlimit", String(limit));
  url.searchParams.set("srnamespace", "0");
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "ScoreLookup/2.0 (IMSLP checker)" },
  });

  if (!res.ok) throw new Error(`IMSLP API returned ${res.status}`);
  const data = await res.json();
  return (data.query?.search || []).map((item) => ({
    title: item.title,
    snippet: item.snippet.replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
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
    headers: { "User-Agent": "ScoreLookup/2.0 (IMSLP checker)" },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.parse?.wikitext?.["*"] || null;
}

// ── Copyright parsing from IMSLP wikitext ───────────────────────────────────

function parseCopyrightFromWikitext(wikitext) {
  if (!wikitext) return { statuses: [], composerDates: null };

  // Extract copyright tags
  const statuses = [];
  const copyrightMatches = wikitext.match(/\|Copyright\s*=\s*([^\n|}]+)/gi);
  if (copyrightMatches) {
    for (const m of copyrightMatches) {
      const val = m.replace(/\|Copyright\s*=\s*/i, "").trim();
      if (val && !statuses.includes(val)) statuses.push(val);
    }
  }

  // Extract composer dates
  let composerDates = null;
  const deathMatch = wikitext.match(/\|Death\s*=\s*(\d{4})/i);
  const birthMatch = wikitext.match(/\|Born\s*=\s*(\d{4})/i);
  if (deathMatch) {
    composerDates = {
      birth: birthMatch ? parseInt(birthMatch[1]) : null,
      death: parseInt(deathMatch[1]),
    };
  }
  // Also try (YYYY-YYYY) pattern
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

  // Check IMSLP copyright tags
  const hasPD = statuses.some((s) => /public\s*domain/i.test(s));
  const hasNonPD = statuses.some((s) => /non.*public\s*domain|copyrighted/i.test(s));
  const hasCC = statuses.some((s) => /creative\s*commons/i.test(s));

  if (hasPD && !hasNonPD) {
    verdict = "YES";
    details.push("Tagged as Public Domain on IMSLP.");
  } else if (hasPD && hasNonPD) {
    verdict = "PARTIALLY";
    details.push("Some editions are Public Domain on IMSLP, while others remain under copyright.");
  } else if (hasCC) {
    verdict = "OPEN LICENSE";
    details.push("Available under a Creative Commons license on IMSLP.");
  } else if (hasNonPD) {
    verdict = "NO";
    details.push("Tagged as copyrighted on IMSLP.");
  }

  // Composer death date analysis
  if (composerDates && composerDates.death) {
    const yearsSinceDeath = currentYear - composerDates.death;
    const dates = composerDates.birth
      ? `(${composerDates.birth}–${composerDates.death})`
      : `(d. ${composerDates.death})`;

    if (yearsSinceDeath > 70) {
      details.push(`Composer ${dates} died over 70 years ago — original works are public domain in most countries.`);
      if (verdict === "UNKNOWN") verdict = "LIKELY YES";
    } else if (yearsSinceDeath > 50) {
      details.push(`Composer ${dates} died ${yearsSinceDeath} years ago — PD in life+50 countries (Canada) but NOT in life+70 countries (US, EU).`);
      if (verdict === "UNKNOWN") verdict = "DEPENDS ON COUNTRY";
    } else {
      details.push(`Composer ${dates} died only ${yearsSinceDeath} years ago — likely still under copyright.`);
      if (verdict === "UNKNOWN") verdict = "LIKELY NO";
    }
  }

  if (verdict === "UNKNOWN") {
    details.push("Could not determine copyright status from IMSLP data. Check the page directly.");
  }

  details.push("Note: Specific editions and arrangements may have their own separate copyright.");

  return { verdict, details };
}

// ── Tiny Haiku call to expand search variations ─────────────────────────────

async function generateSearchVariations(userQuery) {
  if (!API_KEY) return [userQuery];

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: `You generate search variations for IMSLP (music score library). Given a user query, output a JSON array of 5-8 search strings that might match the work on IMSLP. Include:
- Full formal title (e.g. "Sonata No. 6" not just "6 sonata")
- Composer last name + work title variations  
- The original language title if applicable
- Common catalog numbers (Op., BWV, K., etc.) if you know them
- The query as-is

ONLY output a valid JSON array of strings, nothing else. No markdown, no explanation.
Example input: "ysaye 6 sonata"
Example output: ["Ysaÿe Sonata No. 6", "Six Sonatas for Solo Violin (Ysaÿe, Eugène)", "Ysaÿe Op. 27 No. 6", "Sonata No. 6 Ysaÿe", "ysaye 6 sonata"]`,
        messages: [{ role: "user", content: userQuery }],
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error("Haiku error:", data.error.message);
      return [userQuery];
    }

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Parse JSON array
    const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const variations = JSON.parse(cleaned);
    if (Array.isArray(variations) && variations.length > 0) {
      return variations;
    }
    return [userQuery];
  } catch (err) {
    console.error("Variation generation failed:", err.message);
    return [userQuery];
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// IMSLP search with smart variations
app.get("/api/search", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });

  try {
    // Step 1: Generate smart search variations via tiny Haiku call
    const variations = await generateSearchVariations(q);

    // Step 2: Search IMSLP with each variation, collect unique results
    const seen = new Set();
    const allResults = [];

    for (const v of variations) {
      try {
        const results = await imslpSearch(v, 3);
        for (const r of results) {
          if (!seen.has(r.title)) {
            seen.add(r.title);
            allResults.push(r);
          }
        }
      } catch (searchErr) {
        // Individual search failed, continue with others
      }
      if (allResults.length >= 8) break;
    }

    res.json({
      results: allResults.slice(0, 8),
      variations: variations,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Failed to search IMSLP. Please try again." });
  }
});

// Copyright check: variations → IMSLP search → parse pages
app.get("/api/copyright", async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json({ results: [] });

  try {
    // Step 1: Generate variations
    const variations = await generateSearchVariations(q);

    // Step 2: Search IMSLP
    const seen = new Set();
    const searchResults = [];

    for (const v of variations) {
      try {
        const results = await imslpSearch(v, 3);
        for (const r of results) {
          if (!seen.has(r.title)) {
            seen.add(r.title);
            searchResults.push(r);
          }
        }
      } catch (searchErr) {}
      if (searchResults.length >= 5) break;
    }

    if (searchResults.length === 0) {
      return res.json({
        results: [],
        message: `No results found on IMSLP for "${q}". Try different search terms (e.g. composer last name + work title).`,
      });
    }

    // Step 3: Fetch page content and parse copyright for top results
    const results = [];
    for (const item of searchResults.slice(0, 3)) {
      try {
        const wikitext = await imslpGetPage(item.title);
        const { statuses, composerDates } = parseCopyrightFromWikitext(wikitext);
        const analysis = analyzeCopyright(statuses, composerDates);

        results.push({
          title: item.title,
          link: item.link,
          verdict: analysis.verdict,
          details: analysis.details,
        });
      } catch (parseErr) {
        results.push({
          title: item.title,
          link: item.link,
          verdict: "UNKNOWN",
          details: ["Could not retrieve details. Visit the IMSLP page directly."],
        });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("Copyright check error:", err);
    res.status(500).json({ error: "Failed to check copyright. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`Score Lookup running at http://localhost:${PORT}`);
});
