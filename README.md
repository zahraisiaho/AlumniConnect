# AlumniConnect frontend (multi-university)

    npm install
    npm run dev        # open the URL it prints (http://localhost:5173)

Demo logins (password `password123`): student@demo.com, alumni@demo.com, admin@demo.com

Runs standalone: `src/lib/api.js` is a localStorage mock of the backend.
When the Express API is ready, replace the functions in that one file with axios calls; no page needs to change.
To reset demo data: DevTools > Application > Local Storage > clear.
