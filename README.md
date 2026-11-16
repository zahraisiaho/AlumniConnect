# AlumniConnect

AlumniConnect is a multi-university alumni mentorship platform. Students are matched with alumni mentors by a hybrid
matcher: a transparent rule-based score, plus a learned model (logistic regression) and text similarity of bios.

**Release:** v1.0.0

| Part | Technology | Folder |
|---|---|---|
| Interface | React 18, Vite 5, Tailwind CSS 4, Clerk (sign-in) | repository root (`src/`) |
| API | Node.js, Express, PostgreSQL, Clerk | `backend/` |
| Database scripts | PostgreSQL | `database/` |
| Machine learning | Python 3, scikit-learn | `ml/` |

## Features

- Sign-in and sign-up with Clerk (email and password, password reset).
- Profiles with university, field of study, skills, interests, industry and availability. A CV (PDF or Word) can fill in the form.
- Role from graduation year: a student whose graduation year has passed becomes an alumnus automatically.
- Alumni directory with search and filters across universities.
- Mentor matching for students. Every score shows its reasons. Three modes:
  learned model (if `backend/model/weights.json` is present), rules + text meaning (default without weights), or rules only.
- Mentorship requests. Mentors accept or decline them (at most 5 active mentees).
- Active mentorships with chat, mentoring sessions and a review when the mentorship ends.
- Forum and institutional updates.
- "Improve matching" page where students rate suggested mentors. The ratings can be exported to train the model.
- Privacy (Kenya Data Protection Act, 2019): a visibility setting (members / limited / hidden), a privacy notice and consent at sign-up,
  download my data, and delete my account.
- Administration: manage users and roles, and export training data.

### Demo data

`database/seed.sql` adds fictional demo profiles (for example `student@demo.com`, `alumni@demo.com`, `grace@demo.com`).
They appear in the directory and in matches, so a fresh install has someone to match with.
They have no Clerk account, so you cannot sign in as them. To try the app, sign up with your own email.
To become an administrator, put your email in `ADMIN_EMAILS` (see below) before you sign in for the first time.

## Prerequisites

- **Node.js 20** or newer, with npm.
- **PostgreSQL 18**. The scripts also work on PostgreSQL 16. You need `psql` on your PATH.
- **A free Clerk account.** Create an application and use its development keys (`pk_test_...`, `sk_test_...`).
- **Python 3**, only if you want to regenerate the synthetic data or retrain the model.

## Setup

### 1. Database

The commands below are for Windows PowerShell and assume the `postgres` user on `localhost`; `psql` asks for its password.
Run them from the repository root.

```powershell
psql -U postgres -h localhost -c "CREATE DATABASE alumniconnect"
psql -U postgres -h localhost -d alumniconnect -f database\schema.sql
psql -U postgres -h localhost -d alumniconnect -f database\seed.sql
psql -U postgres -h localhost -d alumniconnect -f database\more_options.sql
```

Run each script **once**, in this order:

- `schema.sql` **drops and recreates every table**. Never run it on a database whose data you want to keep.
- `seed.sql` is **not** safe to run twice: a second run fails or adds duplicate rows.
- `more_options.sql` adds more universities, fields, industries and skills. It is safe to run again.

Optional: `database\demo_bios.sql` gives the demo profiles short bios, so text matching has something to compare.

**Upgrading a database created before v1.0.0:** do not run `schema.sql`. Run the additive scripts instead.
They are safe to run more than once and do not change existing rows:

```powershell
psql -U postgres -h localhost -d alumniconnect -f database\ml_tables.sql
psql -U postgres -h localhost -d alumniconnect -f database\mentorship_flow.sql
psql -U postgres -h localhost -d alumniconnect -f database\privacy.sql
```

### 2. Backend settings: `backend/.env`

Create `backend/.env`. If you have `backend/.env.example`, copy it:

```powershell
copy backend\.env.example backend\.env
```

`.gitignore` excludes `.env.example` as well, so a fresh clone may not have it. In that case, create the file with this content:

```ini
# PostgreSQL connection
DATABASE_URL=postgresql://postgres:<your-password>@localhost:5432/alumniconnect
# Clerk Dashboard > API keys
CLERK_PUBLISHABLE_KEY=pk_test_<your-key>
CLERK_SECRET_KEY=sk_test_<your-key>
# Comma-separated emails that become administrators on their first sign-in
ADMIN_EMAILS=you@example.com
# Where the interface runs (no trailing slash)
CORS_ORIGIN=http://localhost:5173
# Optional
# PORT=4000              # default 4000
# MATCH_MODEL=off        # ignore backend/model/weights.json (no learned model)
# MATCH_SEMANTIC=off     # no text-meaning bonus: rules only
```

### 3. Interface settings: `.env` in the repository root

```ini
VITE_CLERK_PUBLISHABLE_KEY=pk_test_<your-key>
# Optional. Default /api, which the Vite dev server forwards to the backend.
VITE_API_URL=/api
```

Both `.env` files are listed in `.gitignore`. Never commit them.

## Run locally

Use two terminals.

```powershell
# Terminal 1: the API on http://localhost:4000
cd backend
npm install
npm run dev
```

The backend prints which matching mode is active. Check that it is up: http://localhost:4000/api/health should return `{"ok":true}`.
The first start downloads the text model (all-MiniLM-L6-v2, about 90 MB). If it cannot load, the backend uses a word-overlap fallback.

```powershell
# Terminal 2: the interface on http://localhost:5173
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server forwards every `/api` request to http://localhost:4000 (see `vite.config.js`),
so the browser only talks to port 5173.

Production build of the interface: `npm run build` (output in `dist/`), then `npm run preview` to try it.

## Test

### Automated tests (backend)

`npm test` in `backend/` runs **90 automated tests**: unit tests (names, privacy, matching, roles, hybrid model, CV parsing)
and API integration tests. The API tests replace Clerk with a test identity, so no Clerk keys are needed.
`npm run test:unit` runs only the unit tests, without a database.

> **Warning:** the API tests create, change and delete rows. Never run them against a development or live database.
> Use a separate test database.

The API tests need a separate, **freshly seeded** database:

```powershell
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS alumniconnect_test"
psql -U postgres -h localhost -c "CREATE DATABASE alumniconnect_test"
psql -U postgres -h localhost -d alumniconnect_test -f database\schema.sql
psql -U postgres -h localhost -d alumniconnect_test -f database\seed.sql
psql -U postgres -h localhost -d alumniconnect_test -f database\more_options.sql
```

Then point `DATABASE_URL` at that database for the run only. A variable set in the terminal takes precedence over `backend/.env`:

```powershell
cd backend
$env:DATABASE_URL = "postgresql://postgres:<your-password>@localhost:5432/alumniconnect_test"
npm test
Remove-Item Env:DATABASE_URL
```

### Database checks

- `database/tests.sql`: data-integrity tests (duplicate emails, invalid roles, a student marked as mentor, and more).
  Each prints PASS or FAIL, and everything is rolled back at the end.
- `database/verify.sql`: row counts, the directory view, and the rule-based match scores in SQL for the demo student.
  Run it on a freshly seeded database.

```powershell
psql -U postgres -h localhost -d alumniconnect_test -f database\tests.sql
psql -U postgres -h localhost -d alumniconnect_test -f database\verify.sql
```

### Machine learning tests

```powershell
py -m unittest discover ml/tests -v
```

## Deployment

Full step-by-step instructions: **[DEPLOYMENT.md](DEPLOYMENT.md)**. In summary:

1. **Database on Render:** create a PostgreSQL database and load `schema.sql`, `seed.sql` and `more_options.sql` with `psql`,
   using its External Database URL.
2. **API on Render:** create a Web Service from this repository with these settings:

   | Setting | Value |
   |---|---|
   | Root directory | `backend` |
   | Build command | `npm install` |
   | Start command | `npm start` |
   | Health check path | `/api/health` |
   | Environment variables | `DATABASE_URL` (Internal Database URL), `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_EMAILS`, `CORS_ORIGIN` |

3. **Interface on Vercel:** import the repository with these settings:

   | Setting | Value |
   |---|---|
   | Framework preset | Vite |
   | Root directory | `./` |
   | `VITE_API_URL` | `https://<your-service>.onrender.com/api` |
   | `VITE_CLERK_PUBLISHABLE_KEY` | your Clerk publishable key |

4. **Connect the two:** once both are live, set `CORS_ORIGIN` on Render to the Vercel URL, for example
   `https://<your-app>.vercel.app`, with **no trailing slash**. Add the Vercel URL to your Clerk application as well.

Notes:

- `vercel.json` sends every path to `index.html`, so refreshing a page such as `/directory` works.
  It also means `/api` on Vercel does not reach the backend, which is why `VITE_API_URL` must point to Render.
- The free Render web service sleeps after a period of inactivity, so the first request after a pause can take about a minute.
- The free Render database expires after a limited period. Back up your data, or upgrade the database before then.

## Machine learning

The learned model is trained on a **clearly labelled synthetic dataset**, so its numbers show that the method works,
not real-world performance. See `ml/SYNTHETIC_DATA.md` for how the data is generated.

```powershell
py -m pip install -r ml/requirements.txt

# 1. Regenerate the synthetic data (seed 2026 by default, so the result is reproducible).
#    Writes ml/synthetic_pairs.csv. Bios are embedded with the app's own text model, so run "npm install" in backend/ first.
py ml/make_synthetic.py --seed 2026

# 2. Train and evaluate against the rule-based baseline (precision@k, accuracy, F1, AUC).
#    Writes weights.json, metrics.json, results.md and results_chart.png to ml/output.
py ml/train.py ml/synthetic_pairs.csv --out ml/output

# 3. Use the model: copy weights.json (and metrics.json) to backend/model/, then restart the backend.
copy ml\output\weights.json backend\model\weights.json
copy ml\output\metrics.json backend\model\metrics.json
```

- When `backend/model/weights.json` is present, the backend ranks mentors with the model. The app labels this method
  "Learned model (trained on synthetic data)".
- To check the model against real ratings, export them from Admin > Matching model > Export training data (CSV) and add `--real <file.csv>` to the train command.
- `ml/AlumniConnect_matching_training.ipynb` contains the same steps as a notebook.
- `backend/model/README.txt` explains the three matching modes.

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| The browser console shows a **CORS error** | `CORS_ORIGIN` on the backend does not exactly match the address the interface runs on. Locally it is `http://localhost:5173`. On Render it is the Vercel URL, with no trailing slash. Restart or redeploy the backend after you change it. |
| The backend stops with "Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY in backend/.env", or the sign-in page does not load | Clerk keys are missing. Set `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` in `backend/.env`, and `VITE_CLERK_PUBLISHABLE_KEY` in the root `.env` (on Vercel, in its environment variables, then redeploy). Restart `npm run dev` after you edit a `.env` file. |
| Render fails with **"Missing script: build"** | The build command is set to `npm run build`, but the backend has no build script. Set the build command to `npm install`. |
| `npm test` fails with many **404 or 403** errors | The test database is not freshly seeded, or `DATABASE_URL` does not point to it. Recreate `alumniconnect_test` and load `schema.sql`, `seed.sql` and `more_options.sql` again (see [Test](#test)). |
| Pages load, but every request fails on Vercel | `VITE_API_URL` is missing on Vercel, so `/api` goes to `index.html`. Set it to `https://<your-service>.onrender.com/api` and redeploy. |
