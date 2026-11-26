-- Run this ONCE on a database that already has schema.sql loaded. It adds the profile_embeddings table used by text matching.
-- (A fresh schema.sql run already includes it.)
-- ---------- Matching intelligence: cached text embeddings ----------
-- Cached sentence embeddings of each profile's free-text bio (recomputed when the text or provider changes).
CREATE TABLE IF NOT EXISTS profile_embeddings (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  text_hash  TEXT NOT NULL,
  vector     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

