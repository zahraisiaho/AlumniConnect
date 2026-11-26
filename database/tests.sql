-- Data-integrity tests. Each invalid action must be rejected. Everything is rolled back at the end.
BEGIN;
DO $$ BEGIN
  BEGIN INSERT INTO users (email,password_hash,name,role,university_id) VALUES ('STUDENT@demo.com','x','Dup','student',1);
        RAISE NOTICE 'FAIL IT-01 duplicate email (case-insensitive) accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS IT-01 duplicate email rejected'; END;
  BEGIN INSERT INTO users (email,password_hash,name,role,university_id) VALUES ('a@x.com','x','A','teacher',1);
        RAISE NOTICE 'FAIL IT-02 invalid role accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS IT-02 invalid role rejected'; END;
  BEGIN INSERT INTO users (email,password_hash,name,role,university_id,is_mentor) VALUES ('b@x.com','x','B','student',1,TRUE);
        RAISE NOTICE 'FAIL IT-03 student mentor accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS IT-03 student marked as mentor rejected'; END;
  BEGIN INSERT INTO users (email,password_hash,name,role) VALUES ('c@x.com','x','C','student');
        RAISE NOTICE 'FAIL IT-04 student without university accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS IT-04 student without university rejected'; END;
  BEGIN INSERT INTO mentorship_requests (student_id,mentor_id) SELECT s.id,m.id FROM users s,users m WHERE s.email='student@demo.com' AND m.email='alumni@demo.com';
        INSERT INTO mentorship_requests (student_id,mentor_id) SELECT s.id,m.id FROM users s,users m WHERE s.email='student@demo.com' AND m.email='alumni@demo.com';
        RAISE NOTICE 'FAIL IT-05 duplicate request accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS IT-05 duplicate mentorship request rejected'; END;
  BEGIN INSERT INTO mentorship_requests (student_id,mentor_id,status) SELECT s.id,m.id,'maybe' FROM users s,users m WHERE s.email='student@demo.com' AND m.email='grace@demo.com';
        RAISE NOTICE 'FAIL IT-06 invalid status accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS IT-06 invalid request status rejected'; END;
  BEGIN INSERT INTO mentorship_matches (student_id,mentor_id,score) SELECT s.id,m.id,101 FROM users s,users m WHERE s.email='student@demo.com' AND m.email='alumni@demo.com';
        RAISE NOTICE 'FAIL IT-07 score 101 accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS IT-07 match score above 100 rejected'; END;
  BEGIN INSERT INTO forum_posts (author_id,title,body,category) SELECT id,'   ','text','General' FROM users WHERE email='student@demo.com';
        RAISE NOTICE 'FAIL IT-08 empty post title accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS IT-08 empty forum title rejected'; END;
  BEGIN INSERT INTO forum_posts (author_id,title,body,category) SELECT id,'t','text','Gossip' FROM users WHERE email='student@demo.com';
        RAISE NOTICE 'FAIL IT-09 invalid category accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS IT-09 invalid forum category rejected'; END;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alumni_directory' AND column_name IN ('email','password_hash'))
    THEN RAISE NOTICE 'FAIL IT-10 directory view exposes email or password hash';
    ELSE RAISE NOTICE 'PASS IT-10 directory view excludes email and password hash'; END IF;
  -- Clerk sign-in link
  BEGIN
    INSERT INTO users (email,clerk_user_id,name,role,university_id) VALUES ('clerk1@x.com','user_abc','Clerk One','student',1);
    RAISE NOTICE 'PASS IT-11 profile can be created from a Clerk account with no password';
    INSERT INTO users (email,clerk_user_id,name,role,university_id) VALUES ('clerk2@x.com','user_abc','Clerk Two','student',1);
    RAISE NOTICE 'FAIL IT-12 same Clerk account linked to two profiles';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS IT-12 same Clerk account cannot be linked to two profiles'; END;
END $$;
ROLLBACK;
