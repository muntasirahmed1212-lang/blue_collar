> [!WARNING] **Skepticism Disclaimer**
> While configuration syntax and local development versus simulated production behaviors passed 17 automated assertions, live multi-host network routing and cloud-provider SSL/cookie forwarding between Vercel, Render, and Neon can only be fully validated upon real-cloud deployment.

## 1. What I changed
- **`vercel.json`**: Updated rewrites to route `/api/:path*` to `https://YOUR-APP.onrender.com/api/:path*` as a reverse proxy, and preserved `Cache-Control: no-store` headers for `/api/*` routes.
- **`render.yaml`**: Maintained backend start command (`npm start` -> `node server.js`) and added `FRONTEND_URL` with `sync: false` to `envVars`.
- **`server.js`**: Wrapped static file serving (`app.use(express.static(...))`) and fallback `index.html` handler inside `if (process.env.NODE_ENV !== 'production')` block to prevent static file serving in production while keeping local development intact.
- **`api/auth.js`**: Deleted deprecated Vercel serverless function entry point via `git rm`.
- **`tests/test-3tier-deployment.test.js`**: Created automated test suite testing R1 through R5.
- **Forbidden files**: Verified `js/services/authService.js` and `js/components/authUI.js` remain completely untouched.

## 2. Why
- **R1 (Vercel Proxy)**: Enables a 3-tier split architecture where the frontend hosted on Vercel proxies all `/api/*` requests to the Render backend, preventing browser CORS blockers and eliminating frontend code changes, while preventing client-side caching of API responses.
- **R2 (Render Blueprint)**: Render requires blueprint declarations for startup and environment variable placeholders. Declaring `FRONTEND_URL` with `sync: false` ensures the backend can accept requests from the Vercel domain without hardcoding secrets in version control.
- **R3 (Production Static Isolation)**: In production, Vercel's CDN serves static assets and HTML; the Render backend should strictly serve API routes. Disabling static serving in production avoids serving stale assets and conserves backend resources.
- **R4 (Deprecated Functions Removal)**: `api/auth.js` was an incomplete Vercel serverless function depending on undeclared packages (`cookie-parser`, `jsonwebtoken`). With proxy rewrites in place, it is obsolete.
- **R5 (Forbidden Files)**: Preserving `authService.js` and `authUI.js` ensures relative path API calls seamlessly work through the Vercel proxy without code changes.

## 3. Verification Record
- **Deep Verification (ran actual tests):**
  - Ran `node tests/test-3tier-deployment.test.js` — all 17/17 tests passed:
    - `vercel.json` contains valid JSON, rewrite rule matching `/api/:path*` to Render URL, and `Cache-Control: no-store` headers.
    - `render.yaml` contains `npm start` startCommand and `FRONTEND_URL` with `sync: false`.
    - `server.js` guards `express.static` with `process.env.NODE_ENV !== 'production'`.
    - Development mode test (`NODE_ENV=development`): Server serves `/`, `/jobs.html`, and `/api/jobs` with HTTP 200.
    - Production mode test (`NODE_ENV=production`): Server returns HTTP 404 for `/`, `/jobs.html`, and `/css/variables.css`, while continuing to serve `/api/jobs` with HTTP 200.
    - Clean deletion test: `api/auth.js` does not exist (`fs.existsSync === false`).
    - Immutability test: `git diff HEAD -- js/services/authService.js` and `git diff HEAD -- js/components/authUI.js` return 0 diff.
- **Shallow Verification (manual run only):**
  - Inspected `git diff` across `vercel.json`, `render.yaml`, `server.js`, and `git status` for unstaged/staged changes.
- **Unverified aspects:**
  - Live deployment to Vercel Edge network and Render Cloud container instances (requires live platform deployments).
  - Cross-domain cookie delivery (`SameSite=None; Secure`) over public HTTPS between distinct domain names.

## 4. Known Issues
- `Minor Robustness Risk` — The Render URL in `vercel.json` is set to the placeholder `https://YOUR-APP.onrender.com/api/:path*`; developers must substitute their actual Render service name before production traffic is routed.
- `Minor Robustness Risk` — If `FRONTEND_URL` is unset in the Render Dashboard, CORS origin check allows localhost origins and blocks other non-proxied cross-origin requests (proxied same-origin requests via Vercel rewrites will still succeed).

## 5. Untested Edge Cases & Next Step
- Deploy to Vercel and Render preview environments and verify that session cookies set by `/api/auth/login` persist across proxied requests and that streaming or chunked API responses pass through Vercel rewrites without truncation.
