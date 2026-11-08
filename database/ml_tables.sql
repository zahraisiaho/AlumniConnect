-- Run this ONCE on a database that already has schema.sql loaded. It adds the two tables for the learned matching model.
-- (A fresh schema.sql run already includes them.)
-- ---------- Matching intelligence: tester ratings and cached text embeddings ----------
-- Ratings are collected on the "Improve matching" page and used to train the learned ranking model.
CREATE TABLE IF NOT EXISTS match_feedback (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helpful    BOOLEAN NOT NULL,                       -- "Would this person be a helpful mentor for you?"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, mentor_id),                    -- one rating per student-mentor pair
  CHECK (student_id <> mentor_id)
);
-- Cached sentence embeddings of each profile's free-text bio (recomputed when the text or provider changes).
CREATE TABLE IF NOT EXISTS profile_embeddings (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  text_hash  TEXT NOT NULL,
  vector     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

