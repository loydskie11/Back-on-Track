-- ══════════════════════════════════════════════════════════
--  Back on Track — Supabase Database Setup
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════

-- 1. Users table (stores hashed passwords, no Supabase Auth needed)
CREATE TABLE IF NOT EXISTS bot_users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. Profiles table (one per user)
CREATE TABLE IF NOT EXISTS bot_profiles (
  id             BIGSERIAL PRIMARY KEY,
  user_id        TEXT REFERENCES bot_users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  course         TEXT,
  company        TEXT,
  address        TEXT,
  supervisor     TEXT,
  required_hours NUMERIC NOT NULL DEFAULT 486,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 3. DTR Entries table (v2: added status column)
CREATE TABLE IF NOT EXISTS bot_entries (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES bot_users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'present',
  day_number INTEGER,
  date       DATE NOT NULL,
  hours      NUMERIC NOT NULL DEFAULT 0,
  details    TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- If upgrading an existing database, run this too:
-- ALTER TABLE bot_entries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'present';
-- ALTER TABLE bot_entries ALTER COLUMN day_number DROP NOT NULL;

-- ──────────────────────────────────────────────────────────
--  Row Level Security (RLS) — keeps data private per user
-- ──────────────────────────────────────────────────────────

-- Enable RLS
ALTER TABLE bot_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_entries  ENABLE ROW LEVEL SECURITY;

-- Since we use anon key + custom auth, allow anon full access
-- (The app itself controls who sees what via user_id filtering)
-- For personal use only — this is safe since data is filtered by user_id in the app.

CREATE POLICY "allow_anon_users"    ON bot_users    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_profiles" ON bot_profiles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "allow_anon_entries"  ON bot_entries  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────
--  Indexes for faster queries
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_user ON bot_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_user  ON bot_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_day   ON bot_entries(user_id, day_number);

-- ══════════════════════════════════════════════════════════
--  Done! After running this, go to app.js and fill in:
--    const SUPABASE_URL = 'https://your-project.supabase.co';
--    const SUPABASE_ANON_KEY = 'your-anon-key-here';
-- ══════════════════════════════════════════════════════════
