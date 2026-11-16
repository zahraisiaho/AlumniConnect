# Deploying AlumniConnect

This guide puts the database and the API on **Render** and the interface on **Vercel**. Both have free plans.
Do the steps in order, because each one needs an address from the step before.

You need:

- the repository on GitHub;
- accounts on Render, Vercel and Clerk;
- `psql` on your computer (it comes with PostgreSQL).

Never commit keys or database URLs. Enter them only in the Render and Vercel dashboards.

---

## 1. Database (Render PostgreSQL)

1. In Render, choose **New > Postgres**. Give it a name, choose a region, and pick the **Free** plan.
2. When it is ready, open it and copy the following:
   - the **Internal Database URL**, which the API will use;
   - the **External Database URL**, which you use from your computer.
3. Load the scripts from the repository root, once each, in this order. Windows PowerShell:

   ```powershell
   $db = "<External Database URL>"
   psql $db -f database\schema.sql
   psql $db -f database\seed.sql
   psql $db -f database\more_options.sql
   Remove-Item Variable:db
   ```

   - `schema.sql` drops and recreates every table, so run it only on this new, empty database.
   - `seed.sql` must not be run twice.
   - Optional: add `psql $db -f database\demo_bios.sql` before the `Remove-Item` line, to give the demo profiles bios.
4. Check the result with `psql "<External Database URL>" -f database\verify.sql`.

> The free Render database **expires after a limited period** (check Render's current terms).
> Back up anything you want to keep, for example with `pg_dump "<External Database URL>" -f backup.sql`, or upgrade the plan before it expires.

## 2. API (Render Web Service)

1. In Render, choose **New > Web Service** and connect the GitHub repository.
2. Settings:

   | Setting | Value |
   |---|---|
   | Branch | `main` |
   | Root Directory | `backend` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance type | Free |

   Use `npm install`, **not** `npm run build`. The backend has no build script, and Render would stop with "Missing script: build".
3. Under **Environment**, add these variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Internal Database URL from step 1 |
   | `CLERK_PUBLISHABLE_KEY` | `pk_test_...` from Clerk Dashboard > API keys |
   | `CLERK_SECRET_KEY` | `sk_test_...` from the same page |
   | `ADMIN_EMAILS` | the emails that become administrators on their first sign-in, comma-separated |
   | `CORS_ORIGIN` | `http://localhost:5173` for now; you change it in step 4 |
   | `NODE_VERSION` | `20` |

   Optional: `MATCH_MODEL=off` ignores the learned model. `MATCH_SEMANTIC=off` turns off text matching (rules only).
   Do not set `PORT`: Render provides it, and the server reads it.
4. Under **Advanced > Health Check Path**, enter `/api/health`.
5. Click **Create Web Service**. When the deploy finishes, open `https://<your-service>.onrender.com/api/health`.
   It should show `{"ok":true}`.
   The log shows the matching mode, for example "Learned model (trained on synthetic data)". The model comes from `backend/model/weights.json` in the repository.

> The free web service **sleeps after a period of inactivity**. The first request after a pause wakes it up and can take
> about a minute. The first start also downloads the text model (about 90 MB).
> If the service runs out of memory, set `MATCH_SEMANTIC=off`: matching then uses rules only, and the learned model ignores text similarity.

## 3. Interface (Vercel)

1. In Vercel, choose **Add New > Project** and import the GitHub repository.
2. Settings:

   | Setting | Value |
   |---|---|
   | Framework Preset | Vite |
   | Root Directory | `./` |
   | Build Command | `npm run build` (the default) |
   | Output Directory | `dist` (the default) |

3. Under **Environment Variables**, add these:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-service>.onrender.com/api` (the Render URL plus `/api`) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | the same `pk_test_...` key as on Render |

   Vite builds these values into the interface. If you change one, redeploy.
4. Click **Deploy**, then note the address, for example `https://<your-app>.vercel.app`.

`vercel.json` sends every path to `index.html`, so refreshing a page such as `/directory` or `/mentorships` works.
The same rule means `/api` on Vercel never reaches the backend, so `VITE_API_URL` must point to Render.

## 4. Connect the interface and the API

1. On Render, open the web service, go to **Environment**, and set:

   ```
   CORS_ORIGIN=https://<your-app>.vercel.app
   ```

   Use the exact Vercel address with **no trailing slash**. Save, and let Render redeploy.
2. In the Clerk Dashboard, add the Vercel address under your application's allowed origins and redirect URLs (the domains settings).
   Development keys work on a `vercel.app` address, and Clerk shows a small development banner.
   Production keys require a domain you own.

## 5. Check the deployment

1. Open the Vercel address and sign up with a new account. The first request may be slow while Render wakes up.
2. Complete your profile. The directory and the mentor matches should list the demo profiles.
3. Sign in with an email listed in `ADMIN_EMAILS` and open the Admin page.

## Problems

| Problem | Fix |
|---|---|
| CORS error in the browser console | `CORS_ORIGIN` on Render does not exactly match the Vercel address (check `https`, the spelling, and that there is no trailing slash). |
| "Missing script: build" on Render | Set the Build Command to `npm install`. |
| Every API call fails, and the network tab shows HTML responses | `VITE_API_URL` is missing or wrong on Vercel. Set it, then redeploy. |
| Sign-in does not load | `VITE_CLERK_PUBLISHABLE_KEY` is missing on Vercel, or the Vercel address is not allowed in Clerk. |
| The Render service fails to start with "Set DATABASE_URL" or "Set CLERK_..." | A variable is missing in the Render Environment settings. |
| Health check fails | The database is unreachable. Use the Internal Database URL, and check that the database has not expired. |
