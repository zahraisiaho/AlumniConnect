-- Optional: short fictional bios for the demo accounts, so text-similarity matching has something to compare.
-- Run after seed.sql:  psql -U postgres -h localhost -d alumniconnect -f database\demo_bios.sql
UPDATE users SET bio = v.bio FROM (VALUES
  ('student@demo.com', 'Final-year computer science student. I want guidance on breaking into software engineering abroad, building a strong portfolio, and preparing for technical interviews.'),
  ('alumni@demo.com',  'Senior software engineer working on cloud platforms. I mentor students on technical interviews, backend engineering and growing from junior to senior.'),
  ('grace@demo.com',   'Security lead in telecommunications. I help students understand cybersecurity careers, certifications and how to start in a security operations centre.'),
  ('kwame@demo.com',   'Risk manager in banking. I mentor on finance careers, financial modelling, professional qualifications and postgraduate study.'),
  ('neema@demo.com',   'Engineer who started a small solar company. I advise on starting a business, project management and working in renewable energy.'),
  ('sarah@demo.com',   'Product designer. I help students build a design portfolio, prepare for UI and UX interviews and find internships abroad.'),
  ('daniel@demo.com',  'Engineering manager leading machine learning teams. I mentor on data science careers, postgraduate research and leadership.'),
  ('zawadi@demo.com',  'Public health analyst. I mentor on research careers, data analysis for health, postgraduate study and balancing work and life.')
) AS v(email, bio) WHERE users.email = v.email;
