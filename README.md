# Back on Track 📋
### OJT Daily Time Record — PWA

A beautiful, offline-ready PWA for tracking your OJT/internship hours. Built with vanilla HTML/CSS/JS with optional Supabase cloud sync.

---

## 🚀 Quick Start (localStorage mode — no backend needed)

1. Extract the ZIP (or clone the repository).
2. Open `index.html` in any modern browser.
3. Sign up, fill in your profile, and start logging!

> Works fully offline. All data is saved locally in your browser.

---

## 📱 Install as a PWA (Add to Home Screen)

### On iPhone/iPad:
1. Open `index.html` in **Safari**.
2. Tap the Share button (square with arrow).
3. Tap **"Add to Home Screen"**.
4. Tap **Add** — it now works like an app!

### On Android:
1. Open in **Chrome**.
2. Tap the menu (⋮).
3. Tap **"Add to Home screen"** or **"Install app"**.

### On Desktop (Chrome/Edge):
1. Look for the install icon in the address bar.
2. Click **Install**.

> ⚠️ For PWA install to work, the app must be served over HTTP/HTTPS, not opened as a local file. See "Hosting" below.

---

## ☁️ Enable Supabase Cloud Sync (Optional)

To sync data across devices and keep it in the cloud:

**Note: The active Supabase API keys are NOT included in this public repository for security.**

### Step 1 — Create a Supabase project
1. Go to [https://supabase.com](https://supabase.com)
2. Sign up for free and click **"New project"**
3. Fill in your project name, database password, and region
4. Wait for it to provision (~1 minute)

### Step 2 — Run the database setup
1. In your Supabase dashboard, go to **SQL Editor** → **New Query**
2. Open `supabase-setup.sql` from this folder
3. Copy the entire contents and paste into the SQL editor
4. Click **Run** — you should see "Success"

### Step 3 — Get your API credentials
1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy:
   - **Project URL** (looks like `https://xyzabc.supabase.co`)
   - **anon / public key** (long string starting with `eyJ...`)

### Step 4 — Paste credentials into the app
Open `app.js` and find these two lines near the top:

```javascript
const SUPABASE_URL = '';      // ← paste your Project URL here
const SUPABASE_ANON_KEY = ''; // ← paste your anon key here
```

Replace with your actual values:

```javascript
const SUPABASE_URL = '[https://xyzabc.supabase.co](https://xyzabc.supabase.co)';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Save `app.js`. That's it — the app will now use Supabase.

> 🧪 **Testing Phase Limit:** The current code enforces a maximum limit of **15 registered users** to accommodate free-tier database limits during the testing phase.

---

## 🌐 Hosting (Free Options)

For PWA install + multi-device access, host the files online:

### Netlify Drop (Easiest — no account needed):
1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag the entire `back-on-track` folder onto the page
3. You get a free URL instantly (e.g. `https://amazing-sky-123.netlify.app`)

### GitHub Pages:
1. Push the files to a GitHub repo
2. Go to Settings → Pages → Deploy from branch → main
3. Your site is at `https://yourusername.github.io/repo-name`

### Vercel:
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project folder
3. Follow the prompts

---

## 📁 File Structure

```
back-on-track/
├── index.html          — Main app (all screens)
├── style.css           — Stylesheet (iOS-inspired, custom themes)
├── app.js              — App logic, auth, storage, notifications & export
├── sw.js               — Service worker (offline support)
├── manifest.json       — PWA manifest
├── supabase-setup.sql  — Run this in Supabase SQL editor
├── icons/
│   ├── icon-192.png    — App icon (small)
│   └── icon-512.png    — App icon (large)
└── README.md           — This file
```

---

## 🔐 Security Notes

- Passwords are hashed with SHA-256 before storage.
- In localStorage mode, data stays on your device only.
- In Supabase mode, data is filtered by `user_id` — users can only see their own data.
- The anon key is safe to expose in client-side code (Supabase is designed this way).
- For personal use only — not intended for multi-user production deployment.

---

## ✨ Features

**Core Tracking:**
- ✅ Sign in / Sign up with username + password
- ✅ Full profile setup (name, course, company, address, supervisor, required hours)
- ✅ Log DTR entries with day number, date, hours, status (Present/Absent), and work details
- ✅ Auto day numbering
- ✅ Dashboard progress bar with custom dropdown (hours / days / percent view)
- ✅ Search entries with one-click clear button
- ✅ Edit and delete entries

**Data & Export:**
- ✅ **One-Click CSV Export:** Instantly generate and download a formatted DTR journal of all your hours and tasks for school requirements.
- ✅ **JSON Backup & Restore:** Safeguard your offline data by exporting a JSON backup and restoring it on any device.
- ✅ Works fully offline (localStorage fallback with offline queueing)
- ✅ Optional Supabase cloud synchronization

**UI & Experience:**
- ✅ **Daily Reminders:** Local push notifications to remind you to log your hours (customizable time).
- ✅ **Custom Themes:** Choose between Indigo (Default), Warm Earth, or Professional High-Contrast palettes.
- ✅ iOS-inspired "Bento Box" Settings/Profile UI.
- ✅ Fully clickable entry cards for better mobile accessibility.
- ✅ Installable as a native-feeling PWA on iOS, Android, and Desktop.

---

Made with ❤️ for OJT students.