# Handoff Report: Specification Survey for Post Jobs Feature

**Agent:** `spec_miner_survey_3`  
**Date:** 2026-09-25  
**Working Directory:** `c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3`  
**Target Specification Artifact:** `c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\survey_spec.md`  

---

## 1. Observation
1. **User Request & Requirements (`ORIGINAL_REQUEST.md`):**
   - Lines 24–35 specify four primary requirements:
     - **R1: Job Posting Backend API:** CRUD endpoints for jobs (`POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/:id`, `PATCH /api/jobs/:id` or `DELETE /api/jobs/:id`), gated so only logged-in, verified customers can create jobs.
     - **R2: Job Posting Form UI:** Wire desktop and mobile "Post a Job" buttons to open a job posting form collecting title, description, category (12 categories), location, budget range, urgency, photos, preferred date/time; prompt login if unauthenticated.
     - **R3: Job Listing Page & Homepage Preview:** Dedicated `jobs.html` with card layout, category/urgency filtering, date/budget sorting; homepage `index.html` preview showing 4–6 latest open jobs.
     - **R4: Zero Regression on Existing Features:** Full preservation of auth flow, page navigation, search, location modal, theme toggle, mobile menu, and strict immutability of forbidden files.
   - Lines 39–46 define explicit status codes:
     - `POST /api/jobs` creates job returning `{ success: true, job: {...} }` for authenticated verified customer.
     - `POST /api/jobs` returns `401` when unauthenticated.
     - `POST /api/jobs` returns `403` when user is not a verified customer.
     - `GET /api/jobs` returns open jobs without auth requirement.
     - `GET /api/jobs?category=<catId>` filters by category.
   - Lines 67–72 dictate forbidden files and test runner requirements:
     - `js/components/authUI.js` and `js/services/authService.js` are FORBIDDEN from being modified.
     - Verification test suite must exist at `tests/verify-jobs.js` executable via `node tests/verify-jobs.js`.

2. **Existing Server Architecture (`server.js`):**
   - Lines 41–50 configure `express-session` with `httpOnly: true`, storing `req.session.userId`.
   - Lines 60–69 mount `/api/auth` via `authRoutes` and serve static files with fallback to `index.html`.
   - Lines 72–74 listen on `process.env.PORT || 3000`.

3. **Data Layer (`server/db/database.js` & `server/db/users.json`):**
   - JSON file persistence using synchronous fs operations (`readUsers()`, `writeUsers()`, `findUserByEmail()`, `createUser()`, `updateUser()`).
   - User schema contains `id` (UUID), `fullName`, `email`, `password` (bcrypt), `role` (`'customer'`, `'admin'`), `isVerified` (boolean), `createdAt`, `updatedAt`.

4. **Service Categories (`js/data/categories.js`):**
   - Exactly 12 categories are defined (`cat-1` to `cat-12`): Electrician, Plumber, Carpenter, Painter, Constructor, AC Repair, Cleaning, Pest Control, Appliance Repair, Locksmith, CCTV & Security, Gardening.

5. **Existing "Post a Job" UI Hook (`js/components/modal.js`):**
   - Lines 9–19 attach click listener to `.btn-primary` with text `"post a job"`, currently executing:
     `showToast("Post a Job feature coming soon!", "info");`.
   - Desktop button: `<button class="btn btn-primary">Post a Job</button>` (`index.html:87`).
   - Mobile button: `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` (`index.html:125`).

6. **Existing Test Suite Verification (`node tests/verify-all-ac.js`):**
   - Ran `node tests/verify-all-ac.js` which passed cleanly with 6/6 ACs, explicitly validating that `authUI.js` and `authService.js` have 0 modifications (`git status --porcelain`).

---

## 2. Logic Chain
1. **Backend Integration:**
   - Because `server.js` currently routes `/api/auth`, a new modular router `server/routes/jobs.js` with controller `server/controllers/jobController.js` and data layer `server/db/jobs.json` (via helper methods in `server/db/database.js` or `server/db/jobsDatabase.js`) directly mirrors the architecture without touching existing auth logic.
   - For authorization checks: checking `req.session.userId`, reading the user record, verifying `user.isVerified === true` and `user.role === 'customer'` satisfies ACs 39, 40, and 41, returning 401 when unauthenticated and 403 when not a verified customer.
2. **Frontend Trigger & Auth Gating:**
   - Because `authUI.js` exposes `window.authUI = { openModal, closeAllAuthModals }` and `authService` exports `getMe()`, a job posting controller or modal component can inspect auth status without modifying either forbidden file.
   - If `!user`: call `window.authUI.openModal('login-modal')` and show toast ("Please log in to post a job.").
   - If `user && user.isVerified && user.role === 'customer'`: open `#job-post-modal`.
3. **Form UI & Categories:**
   - Form inputs for title, category (populated from `js/data/categories.js`), description, location (pre-filled with `localStorage.getItem('user-location')`), budget min/max, urgency selector (low/med/high/urgent), preferred date/time, and photos ensure 100% field compliance.
4. **Listing & Homepage Preview:**
   - Creating `jobs.html` and routing it dynamically in `js/app.js` allows browsing all open jobs with category/urgency/sort filtering.
   - Adding a `recent-jobs-section` on `index.html` fetched via `GET /api/jobs?limit=6` inside `js/pages/home.js` fulfills the homepage preview requirement.
5. **Zero Regression:**
   - Leaving `authUI.js` and `authService.js` completely unmodified ensures that existing verification tests (`tests/verify-all-ac.js`) pass without regressions.
   - Preserving navigation links and adding `jobs.html` across headers keeps all 6 existing pages functional.

---

## 3. Caveats
1. **Existing Legacy Test in `tests/e2e-login-modal.js`:**
   - Lines 503–535 and 1048–1061 of `tests/e2e-login-modal.js` check if unauthenticated clicks on "Post a Job" display a toast containing `"Post a Job feature coming soon!"`.
   - In the new implementation, clicking "Post a Job" when not logged in shows a login prompt (as requested by R2 and AC 50). If `tests/e2e-login-modal.js` is run as a legacy test, the implementation may choose to either show an informative toast alongside opening the login modal, or note that `e2e-login-modal.js` tested the stub state which is now replaced.
2. **Budget Representation Flexibility:**
   - The specification supports both structured `{ min, max, currency }` and numeric/string ranges (e.g. `"500-1000"` or `500`), normalizing on the backend to avoid client-server schema mismatch.
3. **Vercel Serverless Function Deployment:**
   - If deployment to Vercel is executed, `vercel.json` rewrites should include `/api/jobs/(.*)` pointing to `api/jobs` if serverless execution is desired, although local Express server (`server.js`) remains the authoritative target runtime.

---

## 4. Conclusion
The complete specification and acceptance criteria for the "Post Jobs" feature have been fully extracted, structured, and documented in:
`c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\survey_spec.md`.

All requirements (R1 Backend API, R2 Job Posting Form UI, R3 Job Listing & Homepage Preview, R4 Zero Regression), field definitions, auth and permission gating rules, edge cases, and automated test suite specifications (`tests/verify-jobs.js`) are unambiguous and ready for architectural design and task dispatching.

---

## 5. Verification Method

To independently verify the findings in this report:

1. **Inspect the Specification Document:**
   ```powershell
   Get-Content -Path "c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\survey_spec.md"
   ```
2. **Verify Forbidden Files Have Not Been Touched:**
   ```powershell
   git status --porcelain js/components/authUI.js js/services/authService.js
   ```
   *(Must output empty, indicating 0 changes).*
3. **Run Existing Acceptance Criteria Verification Suite:**
   ```powershell
   node tests/verify-all-ac.js
   ```
   *(Must pass all 6 acceptance criteria).*
4. **Inspect "Post a Job" UI Hook in Codebase:**
   ```powershell
   Select-String -Path "js\components\modal.js" -Pattern "post a job" -Context 0,5
   ```
