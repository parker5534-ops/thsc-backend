# T!H$C Admin — Deploy Guide (Render)

## What you're deploying
A Node.js backend that:
- Serves the admin dashboard at `your-app.onrender.com/admin`
- Handles Discord OAuth login
- Stores all content/settings in SQLite
- Exposes an API your public Netlify site can call for form submissions and analytics

---

## Step 1 — Finish the .env file

Copy `.env.example` to `.env`:
```
cp .env.example .env
```

Open `.env` and fill in:

```
SESSION_SECRET=     ← run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
DISCORD_CLIENT_SECRET=  ← paste your NEW secret from Discord Developer Portal
DISCORD_CALLBACK_URL=http://localhost:3000/auth/discord/callback  ← for local dev
```

Everything else is already pre-filled for you.

---

## Step 2 — Test locally

```bash
npm install
npm run dev
```

Open http://localhost:3000/admin
You should be redirected to Discord login.

If you get a "redirect_uri_mismatch" error:
→ Go to discord.com/developers/applications → your app → OAuth2
→ Add redirect URI: http://localhost:3000/auth/discord/callback
→ Save and try again

---

## Step 3 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial T!H$C admin dashboard"
```

Create a new repo on GitHub (github.com/new), then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/thsc-admin.git
git push -u origin main
```

Make sure .gitignore is working — `.env` and `thsc.db` should NOT be in the commit.

---

## Step 4 — Deploy to Render

1. Go to render.com → Dashboard → New → Web Service
2. Connect your GitHub account and select the `thsc-admin` repo
3. Render will auto-detect the `render.yaml` config
4. Set these Environment Variables in Render's dashboard:

   | Key | Value |
   |-----|-------|
   | DISCORD_CLIENT_SECRET | your new secret |
   | DISCORD_CALLBACK_URL | https://YOUR-APP.onrender.com/auth/discord/callback |
   | SESSION_SECRET | (click "Generate" in Render) |

   The rest are already in render.yaml and will be set automatically.

5. Click Deploy

Your app will be live at: https://thsc-admin.onrender.com (or whatever name you picked)

---

## Step 5 — Update Discord redirect URI

Once Render gives you your URL:

1. discord.com/developers/applications → your app → OAuth2
2. Add redirect URI: `https://YOUR-APP.onrender.com/auth/discord/callback`
3. Save

---

## Step 6 — Add Persistent Disk (IMPORTANT)

Render's free tier resets the filesystem on each deploy.
Your SQLite database will be wiped.

To fix this:
1. In Render dashboard → your service → Disks
2. Add a disk: Mount Path `/data`, Size 1 GB (free tier supports this)
3. Update `db/database.js` line 4:
   ```js
   const DB_PATH = process.env.NODE_ENV === 'production'
     ? '/data/thsc.db'
     : path.join(__dirname, '..', 'thsc.db');
   ```
4. Commit and redeploy

---

## Step 7 — Wire your Netlify site to the backend

Add this snippet to your `index.html` just before `</body>`:

```html
<script>
  const ADMIN_API = 'https://YOUR-APP.onrender.com';

  // Track page views
  fetch(ADMIN_API + '/api/analytics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_type: 'page_view',
      page: window.location.pathname,
      meta: JSON.stringify({ ref: document.referrer || 'direct' }),
      session_id: sessionStorage.getItem('sid') || (() => {
        const id = Math.random().toString(36).slice(2);
        sessionStorage.setItem('sid', id);
        return id;
      })()
    })
  }).catch(() => {});

  // Track CTA clicks
  document.querySelectorAll('.btn-primary, .nav-cta').forEach(btn => {
    btn.addEventListener('click', () => {
      fetch(ADMIN_API + '/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'cta_click', meta: btn.textContent.trim() })
      }).catch(() => {});
    });
  });
</script>
```

For contact forms, post to:
```
POST https://YOUR-APP.onrender.com/api/submissions
Body: { form_type: "contact", data: { name: "...", discord: "...", subject: "...", message: "..." } }
```

---

## Step 8 — Add your first team member

1. Log into the dashboard at `https://YOUR-APP.onrender.com/admin`
2. Go to Team & Admins in the sidebar
3. Click Add Member
4. Paste their Discord User ID, pick their role, click Add

They can then log in with their own Discord account.

---

## Adding a Discord Bot Token (optional but recommended)

Having a bot token lets the dashboard auto-fetch Discord profile info
(avatar, display name) when you add team members.

1. discord.com/developers/applications → your app → Bot → Add Bot
2. Copy the token
3. Add to Render env vars: `DISCORD_BOT_TOKEN=your_token_here`

Without it, team members show up with just their Discord ID until they log in.

---

## Render Free Tier Notes

- Free services spin down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds (cold start)
- Upgrade to Render Starter ($7/month) to keep it always-on
- The persistent disk addon is free up to 1GB

---

## File Structure

```
thsc-backend/
├── server.js              ← main entry point
├── package.json
├── render.yaml            ← Render deployment config
├── .env.example           ← copy to .env
├── .gitignore
├── db/
│   └── database.js        ← SQLite setup + migrations
├── middleware/
│   └── auth.js            ← requireAdmin, requireOwner
├── routes/
│   ├── auth.js            ← Discord OAuth
│   ├── content.js         ← site content API
│   ├── settings.js        ← site settings API
│   ├── team.js            ← team management API
│   ├── submissions.js     ← form submissions API
│   └── analytics.js       ← analytics API
└── public/
    └── index.html         ← the admin dashboard UI
```
