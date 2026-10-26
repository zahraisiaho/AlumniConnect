-- AlumniConnect database schema (PostgreSQL 16+, tested on 16; compatible with 18)
-- Multi-university: every user belongs to a university; lookup tables mirror src/data/options.js.
-- Re-runnable: drops and recreates everything. Run on an empty or disposable database only.

DROP VIEW  IF EXISTS alumni_directory;
DROP TABLE IF EXISTS forum_replies, forum_posts, updates, mentorship_matches, mentorship_requests,
                     user_interests, user_skills, auth_identities, users, availability_options, interests, skills,
                     industries, fields_of_study, universities CASCADE;

-- ---------- Institutions and controlled vocabularies ----------
CREATE TABLE universities (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE CHECK (length(btrim(name)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fields_of_study     (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE industries          (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE skills              (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE interests           (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE availability_options(id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE);

-- ---------- Users (account + academic and career profile) ----------
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  clerk_user_id   TEXT UNIQUE,     -- links this profile to the Clerk account that signs in (Google, Apple, LinkedIn, GitHub or email)
  email           TEXT NOT NULL CHECK (position('@' IN email) > 1),
  password_hash   TEXT,            -- not used: Clerk stores credentials; kept nullable for the demo seed rows
  name            TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  role            TEXT NOT NULL CHECK (role IN ('student', 'alumnus', 'admin')),
  university_id   INTEGER REFERENCES universities(id) ON DELETE RESTRICT,
  course          TEXT,
  field_id        INTEGER REFERENCES fields_of_study(id),
  grad_year       INTEGER CHECK (grad_year BETWEEN 1980 AND 2040),
  industry_id     INTEGER REFERENCES industries(id),
  job_title       TEXT,            -- not current_role: that is a reserved word in PostgreSQL
  company         TEXT,
  availability_id INTEGER REFERENCES availability_options(id),
  bio             TEXT,
  is_mentor       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT is_mentor OR role = 'alumnus'),            -- only alumni can be mentors
  CHECK (role = 'admin' OR university_id IS NOT NULL)   -- students and alumni must have a university
);
-- Case-insensitive unique email
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE INDEX users_university_idx ON users (university_id);
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE user_skills (
  user_id  INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, skill_id)
);
CREATE TABLE user_interests (
  user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  interest_id INTEGER NOT NULL REFERENCES interests(id) ON DELETE RESTRICT,
  PRIMARY KEY (user_id, interest_id)
);

-- ---------- Mentorship ----------
CREATE TABLE mentorship_requests (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (student_id, mentor_id),            -- no duplicate requests for the same pair
  CHECK (student_id <> mentor_id)
);

CREATE TABLE mentorship_matches (
  id           SERIAL PRIMARY KEY,
  student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentor_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score        INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  reasons      JSONB   NOT NULL DEFAULT '[]'::jsonb,   -- list of strings explaining the score
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, mentor_id),            -- backend upserts: ON CONFLICT (student_id, mentor_id)
  CHECK (student_id <> mentor_id)
);
CREATE INDEX matches_student_score_idx ON mentorship_matches (student_id, score DESC);

-- ---------- Forum ----------
CREATE TABLE forum_posts (
  id         SERIAL PRIMARY KEY,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  body       TEXT NOT NULL CHECK (length(btrim(body))  > 0),
  category   TEXT NOT NULL CHECK (category IN ('Career advice', 'Study & research', 'Jobs & internships', 'Entrepreneurship', 'General')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX forum_posts_category_idx ON forum_posts (category, created_at DESC);

CREATE TABLE forum_replies (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX forum_replies_post_idx ON forum_replies (post_id, created_at);

-- ---------- Institutional updates ----------
CREATE TABLE updates (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  body          TEXT NOT NULL CHECK (length(btrim(body))  > 0),
  university_id INTEGER REFERENCES universities(id) ON DELETE CASCADE,  -- NULL = all universities
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX updates_university_idx ON updates (university_id, created_at DESC);

-- ---------- Directory view: no email, no password hash ----------
CREATE VIEW alumni_directory AS
SELECT u.id, u.name, u.job_title, u.company, u.course, u.grad_year, u.is_mentor,
       uni.name AS university, f.name AS field_of_study, i.name AS industry, a.name AS availability,
       COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id), '{}') AS skills,
       COALESCE((SELECT array_agg(it.name ORDER BY it.name) FROM user_interests ui JOIN interests it ON it.id = ui.interest_id WHERE ui.user_id = u.id), '{}') AS interests
FROM users u
JOIN universities uni ON uni.id = u.university_id
LEFT JOIN fields_of_study f ON f.id = u.field_id
LEFT JOIN industries i ON i.id = u.industry_id
LEFT JOIN availability_options a ON a.id = u.availability_id
WHERE u.role = 'alumnus';
