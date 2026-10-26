-- Quick checks after loading schema.sql and seed.sql.
\echo '--- Row counts (expect 9 universities, 9 users, 3 posts, 1 reply, 3 updates) ---'
SELECT (SELECT count(*) FROM universities) AS universities, (SELECT count(*) FROM users) AS users,
       (SELECT count(*) FROM forum_posts) AS posts, (SELECT count(*) FROM forum_replies) AS replies,
       (SELECT count(*) FROM updates) AS updates;

\echo '--- Alumni directory view (no email, no password hash) ---'
SELECT name, university, job_title, is_mentor FROM alumni_directory ORDER BY name;

\echo '--- Rule-based matching in SQL for the demo student (expect Brian 85, Daniel 60, Sarah 30, Grace 17) ---'
-- Same weights as Table 5.4: field 30; skills 8 each (cap 25); interests 12 each (cap 25); industry 10; availability 5; university 5.
WITH s AS (SELECT * FROM users WHERE email = 'student@demo.com')
SELECT m.name, uni.name AS university,
       (CASE WHEN m.field_id = s.field_id THEN 30 ELSE 0 END)
     + LEAST(25, 8  * (SELECT count(*) FROM user_skills a JOIN user_skills b ON a.skill_id = b.skill_id WHERE a.user_id = s.id AND b.user_id = m.id))
     + LEAST(25, 12 * (SELECT count(*) FROM user_interests a JOIN user_interests b ON a.interest_id = b.interest_id WHERE a.user_id = s.id AND b.user_id = m.id))
     + (CASE WHEN m.industry_id = s.industry_id THEN 10 ELSE 0 END)
     + (CASE WHEN m.availability_id = s.availability_id THEN 5 ELSE 0 END)
     + (CASE WHEN m.university_id = s.university_id THEN 5 ELSE 0 END) AS score
FROM s, users m JOIN universities uni ON uni.id = m.university_id
WHERE m.role = 'alumnus' AND m.is_mentor
ORDER BY score DESC, m.name;
