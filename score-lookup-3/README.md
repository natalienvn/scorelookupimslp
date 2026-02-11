# Score Lookup v2 — Hybrid Approach

Uses a tiny Claude Haiku call to generate smart search variations, then searches IMSLP's free API directly. Way cheaper and no rate limit issues.

**Cost per query: ~$0.001 (one tenth of a cent).** 150 people × 5 queries each = about $0.75 total.

---

## How to update your existing site

Since you already have the GitHub repo and Render service running, you just need to replace the files:

### Step 1: Update your GitHub repo

1. Go to your repo: https://github.com/natalienvn/scorelookupimslp
2. Click on `server.js` → click the **pencil icon** (edit) → **select all** the text and delete it → paste in the new `server.js` content → click **"Commit changes"**
3. Do the same for `public/index.html` — click into the `public` folder, click `index.html`, edit, replace all content, commit

**Or the easier way:**
1. Go to your repo
2. Click **"Add file"** → **"Upload files"**
3. Drag in the new `server.js` and `public` folder
4. Check **"Commit directly to the main branch"**
5. Click **"Commit changes"**

### Step 2: That's it

Render will automatically redeploy when it detects the new files. Wait 1-2 minutes and your site is updated.

---

## How it works now

1. User types "ysaye 6 sonata"
2. Tiny Haiku call (~$0.001) generates smart variations:
   - "Ysaÿe Sonata No. 6"
   - "Six Sonatas for Solo Violin (Ysaÿe, Eugène)"
   - "Ysaÿe Op. 27 No. 6"
   - etc.
3. Each variation searches IMSLP's free MediaWiki API
4. Results are deduplicated and shown with links

For copyright checks, it also parses IMSLP's copyright tags and composer death dates from the actual pages.

---

## Cost comparison

| Approach | Cost per query | 150 users × 5 queries |
|----------|---------------|----------------------|
| Old (full Sonnet + web search) | $0.01–0.03 | $7.50–$22.50 |
| **New (tiny Haiku + free IMSLP API)** | **~$0.001** | **~$0.75** |
