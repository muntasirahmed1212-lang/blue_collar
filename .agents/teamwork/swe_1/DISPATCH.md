## 2026-09-27T18:47:00Z

<USER_REQUEST>
You are teamwork_preview_swe, the SWE Light Orchestrator.

Your working directory is:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\swe_1

The user's original request is recorded in:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md
(Refer to the latest section under ## 2026-09-27T18:45:16Z)

Project Root: c:\Users\munta\Downloads\blue_collar
Integrity mode: development

Task Objective:
Configure the BlueCollar Connect repository for a 3-tier deployment architecture (Frontend on Vercel, Backend API on Render, Database on Neon) using Vercel rewrites to proxy API requests.

Requirements:
- R1. Configure Vercel Proxy Rewrites: Modify `vercel.json` to act as a reverse proxy routing `/api/*` requests to a placeholder Render URL (e.g. `https://YOUR-APP.onrender.com/api/:path*`) with `Cache-Control: no-store` headers for `/api/*` routes.
- R2. Isolate Backend API for Render: Modify `render.yaml` to ensure it starts the Node.js backend (`npm start` or `node server.js`). Add `FRONTEND_URL` to `envVars` list with `sync: false`.
- R3. Disable Production Static Serving: Modify `server.js` so that `express.static` and fallback `index.html` serving are ONLY active in local development (i.e. `if (process.env.NODE_ENV !== 'production')`). The backend must not serve static files in production.
- R4. Clean Up Deprecated Functions: Delete `api/auth.js`.
- R5. Forbidden Files: Do NOT modify `js/services/authService.js` or `js/components/authUI.js`.

Acceptance Criteria:
- vercel.json contains rewrite rule matching `/api/:path*` to the Render URL.
- render.yaml exists and contains necessary startup commands and environment variable placeholders (with sync: false for secrets).
- server.js wraps app.use(express.static(...)) in a development-only environment check.
- api/auth.js no longer exists.
- authService.js and authUI.js remain completely unmodified.
- Run tests / verify changes to establish correctness.

Maintain your progress.md and BRIEFING.md in your working directory. Report completion back to the Sentinel when finished.
</USER_REQUEST>
