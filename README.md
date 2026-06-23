# Back on Track 📋
### OJT Daily Time Record — PWA

A beautiful, offline-ready PWA for tracking your OJT/internship hours[cite: 34]. Built with vanilla HTML/CSS/JS with optional Supabase cloud sync[cite: 34].

---

## 🚀 Quick Start (localStorage mode — no backend needed)

1. Extract the ZIP[cite: 34] (or clone the repository).
2. Open `index.html` in any modern browser[cite: 34].
3. Sign up, fill in your profile, and start logging![cite: 34]

> Works fully offline. All data is saved locally in your browser[cite: 34].

---

## 📱 Install as a PWA (Add to Home Screen)

### On iPhone/iPad:
1. Open `index.html` in **Safari**[cite: 34].
2. Tap the Share button (square with arrow)[cite: 34].
3. Tap **"Add to Home Screen"**[cite: 34].
4. Tap **Add** — it now works like an app![cite: 34]

### On Android:
1. Open in **Chrome**[cite: 34].
2. Tap the menu (⋮)[cite: 34].
3. Tap **"Add to Home screen"** or **"Install app"**[cite: 34].

### On Desktop (Chrome/Edge):
1. Look for the install icon in the address bar[cite: 34].
2. Click **Install**[cite: 34].

> ⚠️ For PWA install to work, the app must be served over HTTP/HTTPS, not opened as a local file[cite: 34]. See "Hosting" below[cite: 34].

---

## ☁️ Enable Supabase Cloud Sync (Optional)

To sync data across devices and keep it in the cloud[cite: 34]:

**Note: The active Supabase API keys are NOT included in this public repository for security.**

### Step 1 — Create a Supabase project
1. Go to [https://supabase.com](https://supabase.com)[cite: 34]
2. Sign up for free and click **"New project"**[cite: 34]
3. Fill in your project name, database password, and region[cite: 34]
4. Wait for it to provision (~1 minute)[cite: 34]

### Step 2 — Run the database setup
1. In your Supabase dashboard, go to **SQL Editor** → **New Query**[cite: 34]
2. Open `supabase-setup.sql` from this folder[cite: 34]
3. Copy the entire contents and paste into the SQL editor[cite: 34]
4. Click **Run** — you should see "Success"[cite: 34]

### Step 3 — Get your API credentials
1. In your Supabase dashboard, go to **Settings** → **API**[cite: 34]
2. Copy:
   - **Project URL** (looks like `https://xyzabc.supabase.co`)[cite: 34]
   - **anon / public key** (long string starting with `eyJ...`)[cite: 34]

### Step 4 — Paste credentials into the app
Open `app.js` and find these two lines near the top[cite: 34]:

```javascript
const SUPABASE_URL = '';      // ← paste your Project URL here
const SUPABASE_ANON_KEY = ''; // ← paste your anon key here
```

Replace with your actual values[cite: 34]:

```javascript
const SUPABASE_URL = '[https://xyzabc.supabase.co](https://xyzabc.supabase.co)';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Save `app.js`. That's it — the app will now use Supabase[cite: 34].

> 🧪 **Testing Phase Limit:** The current code enforces a maximum limit of **15 registered users** to accommodate free-tier database limits during the testing phase.

---

## 🌐 Hosting (Free Options)

For PWA install + multi-device access, host the files online[cite: 34]:

### Netlify Drop (Easiest — no account needed):
1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop)[cite: 34]
2. Drag the entire `back-on-track` folder onto the page[cite: 34]
3. You get a free URL instantly (e.g. `https://amazing-sky-123.netlify.app`)[cite: 34]

### GitHub Pages:
1. Push the files to a GitHub repo[cite: 34]
2. Go to Settings → Pages → Deploy from branch → main[cite: 34]
3. Your site is at `https://yourusername.github.io/repo-name`[cite: 34]

### Vercel:
1. Install Vercel CLI: `npm i -g vercel`[cite: 34]
2. Run `vercel` in the project folder[cite: 34]
3. Follow the prompts[cite: 34]

---

## 📁 File Structure

```
back-on-track/
├── index.html          — Main app (all screens)[cite: 34]
├── style.css           — Stylesheet (iOS-inspired, custom themes)
├── app.js              — App logic, auth, storage, notifications & export
├── sw.js               — Service worker (offline support)[cite: 34]
├── manifest.json       — PWA manifest[cite: 34]
├── supabase-setup.sql  — Run this in Supabase SQL editor[cite: 34]
├── icons/
│   ├── icon-192.png    — App icon (small)[cite: 34]
│   └── icon-512.png    — App icon (large)[cite: 34]
└── README.md           — This file[cite: 34]
```

---

## 🔐 Security Notes

- Passwords are hashed with SHA-256 before storage[cite: 34].
- In localStorage mode, data stays on your device only[cite: 34].
- In Supabase mode, data is filtered by `user_id` — users can only see their own data[cite: 34].
- The anon key is safe to expose in client-side code (Supabase is designed this way)[cite: 34].
- For personal use only — not intended for multi-user production deployment[cite: 34].

---

## ✨ Features

**Core Tracking:**
- ✅ Sign in / Sign up with username + password[cite: 34]
- ✅ Full profile setup (name, course, company, address, supervisor, required hours)[cite: 34]
- ✅ Log DTR entries with day number, date, hours, status (Present/Absent), and work details[cite: 34]
- ✅ Auto day numbering[cite: 34]
- ✅ Dashboard progress bar with custom dropdown (hours / days / percent view)[cite: 34]
- ✅ Search entries with one-click clear button
- ✅ Edit and delete entries[cite: 34]

**Data & Export:**
- ✅ **One-Click CSV Export:** Instantly generate and download a formatted DTR journal of all your hours and tasks for school requirements.
- ✅ **JSON Backup & Restore:** Safeguard your offline data by exporting a JSON backup and restoring it on any device.
- ✅ Works fully offline (localStorage fallback with offline queueing)[cite: 34]
- ✅ Optional Supabase cloud synchronization[cite: 34]

**UI & Experience:**
- ✅ **Daily Reminders:** Local push notifications to remind you to log your hours (customizable time).
- ✅ **Custom Themes:** Choose between Indigo (Default), Warm Earth, or Professional High-Contrast palettes.
- ✅ iOS-inspired "Bento Box" Settings/Profile UI.
- ✅ Fully clickable entry cards for better mobile accessibility.
- ✅ Installable as a native-feeling PWA on iOS, Android, and Desktop[cite: 34].

---

Made with ❤️ for OJT students[cite: 34].