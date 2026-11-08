-- ---------- After a request is accepted: active mentorships, chat, sessions, reviews, read tracking ----------
-- Idempotent and additive: safe to run more than once. Nothing is dropped and no existing rows are changed.
-- Existing database:  psql -U postgres -h localhost -d alumniconnect -f database\mentorship_flow.sql
-- (schema.sql ends with this same block, so a fresh database already has it.)

-- mentorship_matches holds both cached match scores (status NULL, rewritten by GET /api/matches)
-- and real mentorships (status 'active' or 'ended', never touched by that cache). One row per student/mentor pair.
ALTER TABLE mentorship_matches ADD COLUMN IF NOT EXISTS status     TEXT CHECK (status IN ('active', 'ended'));
ALTER TABLE mentorship_matches ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE mentorship_matches ADD COLUMN IF NOT EXISTS ended_at   TIMESTAMPTZ;
ALTER TABLE mentorship_matches ADD COLUMN IF NOT EXISTS ended_by   INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS matches_mentor_active_idx ON mentorship_matches (mentor_id) WHERE status = 'active';

-- Chat. Only the two participants can read it, through the API; administrators see counts only.
CREATE TABLE IF NOT EXISTS messages (
  id         SERIAL PRIMARY KEY,
  match_id   INTEGER NOT NULL REFERENCES mentorship_matches(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_match_idx ON messages (match_id, created_at);

-- Proposed by one participant, confirmed or declined by the other; either can cancel.
CREATE TABLE IF NOT EXISTS mentoring_sessions (
  id          SERIAL PRIMARY KEY,
  match_id    INTEGER NOT NULL REFERENCES mentorship_matches(id) ON DELETE CASCADE,
  proposed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at   TIMESTAMPTZ NOT NULL,
  topic       TEXT NOT NULL CHECK (length(btrim(topic)) BETWEEN 1 AND 200),
  status      TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'declined', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_match_idx ON mentoring_sessions (match_id, starts_at);

-- The student's overall rating once a mentorship has ended. One per mentorship.
CREATE TABLE IF NOT EXISTS mentorship_reviews (
  id         SERIAL PRIMARY KEY,
  match_id   INTEGER NOT NULL UNIQUE REFERENCES mentorship_matches(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT CHECK (comment IS NULL OR length(comment) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- When each participant last opened a mentorship. Anything newer from the other person counts as unread.
CREATE TABLE IF NOT EXISTS mentorship_reads (
  match_id     INTEGER NOT NULL REFERENCES mentorship_matches(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
