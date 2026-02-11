# Score Lookup — IMSLP Public Domain & Score Checker

A simple website that lets anyone check:
1. Whether a musical work is in the **public domain**
2. Whether it's available on **IMSLP**

Powered by the Anthropic API with web search.

---

## How to put this on the internet (step by step)

You'll need two things:
- A **free GitHub account** → https://github.com/signup
- A **free Render account** → https://render.com (sign up with your GitHub)
- An **Anthropic API key** → https://console.anthropic.com

### Step 1: Get an Anthropic API key

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Go to "API Keys" and create a new key
4. Copy it somewhere safe — you'll need it in Step 3

### Step 2: Upload this project to GitHub

1. Go to https://github.com/new
2. Name it `score-lookup`
3. Keep it set to **Public** (or Private, either works)
4. Click **"Create repository"**
5. On the next page, click **"uploading an existing file"**
6. Drag in ALL the files from this project folder:
   - `package.json`
   - `server.js`
   - `public/index.html`
7. Click **"Commit changes"**

### Step 3: Deploy on Render (free)

1. Go to https://render.com and sign in with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your `score-lookup` GitHub repo
4. Fill in the settings:
   - **Name**: `score-lookup` (or whatever you like)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`
5. Scroll down to **"Environment Variables"** and add:
   - **Key**: `ANTHROPIC_API_KEY`
   - **Value**: *(paste your API key from Step 1)*
6. Click **"Create Web Service"**

It'll take about 1-2 minutes to build. Once it's done, Render gives you a URL like:

**https://score-lookup.onrender.com**

That's your live website! Share it with anyone.

---

## Optional: Custom domain

If you want a nicer URL (like `lookup.yourdomain.com`):
1. In Render dashboard, go to your service → **Settings** → **Custom Domains**
2. Add your domain and follow the DNS instructions

---

## Running locally (for testing)

If you want to test it on your own computer first:

```bash
cd score-lookup
npm install
ANTHROPIC_API_KEY=your-key-here npm start
```

Then open http://localhost:3000 in your browser.

---

## Cost

- **Render hosting**: Free tier available
- **Anthropic API**: Pay-per-use. Each check costs roughly $0.01–0.03. 
  See https://www.anthropic.com/pricing for current rates.
