-- ---------- Privacy: profile visibility and consent to the privacy notice ----------
-- Idempotent and additive: safe to run more than once. Nothing is dropped and no profile data is changed.
-- Existing database:  psql -U postgres -h localhost -d alumniconnect -f database\privacy.sql
-- (schema.sql ends with this same block, so a fresh database already has it.)
--
-- visibility: 'members' = full profile in the directory; 'limited' = first name, field, university and skills only;
--             'hidden'  = not listed in the directory and not suggested as a mentor.
-- Existing accounts get the default, 'limited', so nobody becomes more visible than before without choosing it.
-- People in an active mentorship always see each other in full (enforced by the API).
ALTER TABLE users ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'limited';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_visibility_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_visibility_check CHECK (visibility IN ('members', 'limited', 'hidden'));
  END IF;
END $$;

-- When the person agreed to the privacy notice, and which version they saw (NULL = not yet, e.g. accounts made before it).
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_consent_at      TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_notice_version  TEXT;

-- The directory view (not used by the API, which applies the same rule) never lists hidden profiles.
CREATE OR REPLACE VIEW alumni_directory AS
SELECT u.id, u.name, u.job_title, u.company, u.course, u.grad_year, u.is_mentor,
       uni.name AS university, f.name AS field_of_study, i.name AS industry, a.name AS availability,
       COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id), '{}') AS skills,
       COALESCE((SELECT array_agg(it.name ORDER BY it.name) FROM user_interests ui JOIN interests it ON it.id = ui.interest_id WHERE ui.user_id = u.id), '{}') AS interests
FROM users u
JOIN universities uni ON uni.id = u.university_id
LEFT JOIN fields_of_study f ON f.id = u.field_id
LEFT JOIN industries i ON i.id = u.industry_id
LEFT JOIN availability_options a ON a.id = u.availability_id
WHERE u.role = 'alumnus' AND u.visibility <> 'hidden';
