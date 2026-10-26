-- AlumniConnect seed data. All people and companies are fictional.
-- Every demo account uses the password: password123 (stored as a bcrypt hash).
SET client_encoding = 'UTF8';

INSERT INTO universities (name) VALUES
  ('Strathmore University'),
  ('University of Nairobi'),
  ('Kenyatta University'),
  ('JKUAT'),
  ('Moi University'),
  ('Makerere University'),
  ('University of Dar es Salaam'),
  ('University of Cape Town'),
  ('University of Ghana');

INSERT INTO fields_of_study (name) VALUES
  ('Computer Science'),
  ('Information Technology'),
  ('Software Engineering'),
  ('Business Administration'),
  ('Finance & Accounting'),
  ('Economics'),
  ('Engineering'),
  ('Law'),
  ('Medicine & Health Sciences'),
  ('Education'),
  ('Design & Media'),
  ('Agriculture & Environment');

INSERT INTO industries (name) VALUES
  ('Technology'),
  ('Finance & Banking'),
  ('Healthcare'),
  ('Consulting'),
  ('Education'),
  ('Telecommunications'),
  ('Aviation & Logistics'),
  ('Government & NGO'),
  ('Creative & Media'),
  ('Agriculture & Energy');

INSERT INTO skills (name) VALUES
  ('Python'),
  ('JavaScript'),
  ('React'),
  ('SQL'),
  ('Data analysis'),
  ('Machine learning'),
  ('Cybersecurity'),
  ('Cloud'),
  ('UI/UX design'),
  ('Project management'),
  ('Public speaking'),
  ('Financial modelling'),
  ('Research'),
  ('Leadership'),
  ('Marketing');

INSERT INTO interests (name) VALUES
  ('Career guidance'),
  ('CV & interview prep'),
  ('Internships abroad'),
  ('Starting a business'),
  ('Postgraduate study'),
  ('Technical skills'),
  ('Leadership growth'),
  ('Networking'),
  ('Work-life balance');

INSERT INTO availability_options (name) VALUES
  ('Weekday evenings'),
  ('Weekends'),
  ('Flexible'),
  ('Once a month');

INSERT INTO users (email, password_hash, name, role, university_id, course, field_id, grad_year, industry_id, job_title, company, availability_id, is_mentor) VALUES
  ('student@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Amina Wanjiru', 'student', (SELECT id FROM universities WHERE name = 'Strathmore University'), 'BSc Informatics & Computer Science', (SELECT id FROM fields_of_study WHERE name = 'Computer Science'), 2026, (SELECT id FROM industries WHERE name = 'Technology'), NULL, NULL, (SELECT id FROM availability_options WHERE name = 'Weekday evenings'), FALSE),
  ('alumni@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Brian Otieno', 'alumnus', (SELECT id FROM universities WHERE name = 'University of Nairobi'), 'BSc Computer Science', (SELECT id FROM fields_of_study WHERE name = 'Computer Science'), 2018, (SELECT id FROM industries WHERE name = 'Technology'), 'Senior Engineer', 'Nile Systems', (SELECT id FROM availability_options WHERE name = 'Weekday evenings'), TRUE),
  ('grace@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Grace Mutua', 'alumnus', (SELECT id FROM universities WHERE name = 'Strathmore University'), 'BSc Information Technology', (SELECT id FROM fields_of_study WHERE name = 'Information Technology'), 2016, (SELECT id FROM industries WHERE name = 'Telecommunications'), 'Security Lead', 'Savanna Telecom', (SELECT id FROM availability_options WHERE name = 'Weekends'), TRUE),
  ('kwame@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Kwame Mensah', 'alumnus', (SELECT id FROM universities WHERE name = 'University of Ghana'), 'BSc Accounting', (SELECT id FROM fields_of_study WHERE name = 'Finance & Accounting'), 2015, (SELECT id FROM industries WHERE name = 'Finance & Banking'), 'Risk Manager', 'Gold Coast Bank', (SELECT id FROM availability_options WHERE name = 'Weekends'), TRUE),
  ('neema@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Neema Kimaro', 'alumnus', (SELECT id FROM universities WHERE name = 'University of Dar es Salaam'), 'BEng Electrical Engineering', (SELECT id FROM fields_of_study WHERE name = 'Engineering'), 2017, (SELECT id FROM industries WHERE name = 'Agriculture & Energy'), 'Project Engineer', 'SolarWave', (SELECT id FROM availability_options WHERE name = 'Flexible'), TRUE),
  ('sarah@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Sarah Njeri', 'alumnus', (SELECT id FROM universities WHERE name = 'Kenyatta University'), 'BA Graphic Design', (SELECT id FROM fields_of_study WHERE name = 'Design & Media'), 2019, (SELECT id FROM industries WHERE name = 'Technology'), 'Product Designer', 'Kilimani Labs', (SELECT id FROM availability_options WHERE name = 'Weekends'), TRUE),
  ('daniel@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Daniel Kato', 'alumnus', (SELECT id FROM universities WHERE name = 'Makerere University'), 'BSc Computer Science', (SELECT id FROM fields_of_study WHERE name = 'Computer Science'), 2014, (SELECT id FROM industries WHERE name = 'Technology'), 'Engineering Manager', 'Lake Victoria Digital', (SELECT id FROM availability_options WHERE name = 'Once a month'), TRUE),
  ('zawadi@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Zawadi Ali', 'alumnus', (SELECT id FROM universities WHERE name = 'University of Cape Town'), 'MPH Public Health', (SELECT id FROM fields_of_study WHERE name = 'Medicine & Health Sciences'), 2013, (SELECT id FROM industries WHERE name = 'Healthcare'), 'Public Health Analyst', 'Cape Health Trust', (SELECT id FROM availability_options WHERE name = 'Flexible'), TRUE),
  ('admin@demo.com', '$2b$10$jiIZOSyNk.S.DLjr.k4LVusZhZjdVdJHHHQ6ukBfb.D1o4c9Uw10W', 'Platform Admin', 'admin', NULL, NULL, NULL, NULL, NULL, 'Administrator', 'AlumniConnect', NULL, FALSE);

INSERT INTO user_skills (user_id, skill_id)
SELECT u.id, l.id FROM (VALUES
  ('student@demo.com', 'Python'),
  ('student@demo.com', 'React'),
  ('student@demo.com', 'SQL'),
  ('alumni@demo.com', 'Python'),
  ('alumni@demo.com', 'Cloud'),
  ('alumni@demo.com', 'SQL'),
  ('grace@demo.com', 'Cybersecurity'),
  ('grace@demo.com', 'Cloud'),
  ('grace@demo.com', 'Leadership'),
  ('kwame@demo.com', 'Financial modelling'),
  ('kwame@demo.com', 'Data analysis'),
  ('kwame@demo.com', 'Leadership'),
  ('neema@demo.com', 'Project management'),
  ('neema@demo.com', 'Research'),
  ('sarah@demo.com', 'UI/UX design'),
  ('sarah@demo.com', 'JavaScript'),
  ('sarah@demo.com', 'React'),
  ('daniel@demo.com', 'Machine learning'),
  ('daniel@demo.com', 'Python'),
  ('daniel@demo.com', 'Leadership'),
  ('zawadi@demo.com', 'Research'),
  ('zawadi@demo.com', 'Data analysis')
) v(email, name) JOIN users u ON u.email = v.email JOIN skills l ON l.name = v.name;

INSERT INTO user_interests (user_id, interest_id)
SELECT u.id, l.id FROM (VALUES
  ('student@demo.com', 'Career guidance'),
  ('student@demo.com', 'Internships abroad'),
  ('student@demo.com', 'Technical skills'),
  ('alumni@demo.com', 'Technical skills'),
  ('alumni@demo.com', 'Career guidance'),
  ('grace@demo.com', 'Career guidance'),
  ('grace@demo.com', 'Leadership growth'),
  ('kwame@demo.com', 'Leadership growth'),
  ('kwame@demo.com', 'Postgraduate study'),
  ('neema@demo.com', 'Starting a business'),
  ('neema@demo.com', 'Networking'),
  ('sarah@demo.com', 'Internships abroad'),
  ('sarah@demo.com', 'CV & interview prep'),
  ('daniel@demo.com', 'Postgraduate study'),
  ('daniel@demo.com', 'Technical skills'),
  ('zawadi@demo.com', 'Postgraduate study'),
  ('zawadi@demo.com', 'Work-life balance')
) v(email, name) JOIN users u ON u.email = v.email JOIN interests l ON l.name = v.name;

INSERT INTO forum_posts (author_id, title, body, category) VALUES
  ((SELECT id FROM users WHERE email = 'alumni@demo.com'), 'What I wish I knew before my first engineering job', 'Learn to read other people''s code early. Most of the job is that, not writing new code.', 'Career advice'),
  ((SELECT id FROM users WHERE email = 'student@demo.com'), 'Looking for internships abroad for 2027', 'Has anyone found remote or placement-based internships outside Africa? Where did you look?', 'Jobs & internships'),
  ((SELECT id FROM users WHERE email = 'neema@demo.com'), 'Starting a small solar business: where to begin?', 'Happy to share what worked for me. Ask here and I will reply.', 'Entrepreneurship');

INSERT INTO forum_replies (post_id, author_id, body) VALUES
  ((SELECT id FROM forum_posts WHERE title = 'Looking for internships abroad for 2027'), (SELECT id FROM users WHERE email = 'sarah@demo.com'), 'Try your university career office first, then programmes like AIESEC. Apply early.');

INSERT INTO updates (title, body, university_id, created_by) VALUES
  ('Mentorship matching is open', 'Students can now be matched with alumni from any university. Complete your profile to improve your matches.', NULL, (SELECT id FROM users WHERE email = 'admin@demo.com')),
  ('Strathmore alumni networking evening', 'Join fellow Strathmore graduates for an evening of networking.', (SELECT id FROM universities WHERE name = 'Strathmore University'), (SELECT id FROM users WHERE email = 'admin@demo.com')),
  ('Makerere careers week', 'Alumni talks and CV clinics during careers week.', (SELECT id FROM universities WHERE name = 'Makerere University'), (SELECT id FROM users WHERE email = 'admin@demo.com'));
