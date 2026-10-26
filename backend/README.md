# AlumniConnect backend (Express + PostgreSQL + Clerk)

    npm install
    copy .env.example .env      # fill in DATABASE_URL, Clerk keys, ADMIN_EMAILS
    npm run dev                 # http://localhost:4000/api/health should return {"ok":true}
    npm test                    # unit tests + integration tests (needs the database loaded; no Clerk keys needed)

Sign-in is handled by Clerk. The API verifies the Clerk session, then looks up the user's profile and role in PostgreSQL.
Administrators: the first sign-in of an email listed in ADMIN_EMAILS creates the admin profile.
Load the database first: ../database (schema.sql, then seed.sql). Never commit `.env`.
