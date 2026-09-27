# Handoff Report: Backend Architecture Investigation for "Post Jobs" Feature

**Agent**: explorer_survey_1  
**Working Directory**: `c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1`  
**Handoff Type**: Hard (Task Complete)  
**Detailed Survey File**: `c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1\survey_backend.md`  

---

## 1. Observation

1. **`server.js` Middleware & Static Serving Order**:
   - `server.js:41-50`: Express session is mounted using `express-session` with secret from `process.env.SESSION_SECRET || 'fallback_secret_key'`, cookie maxAge 24h, `httpOnly: true`.
   - `server.js:53-58`: Global rate limiting is applied to `/api/` (`100 requests per 15 min`).
   - `server.js:61`: Auth routes mounted at `app.use('/api/auth', authRoutes)`.
   - `server.js:64`: Static file serving mounted at `app.use(express.static(path.join(__dirname, '.')))`.
   - `server.js:67-69`: Catch-all fallback serves `index.html`.
   - Direct quote from lines 60-69:
     ```javascript
     // ─── API Routes ────────────────────────────────
     app.use('/api/auth', authRoutes);

     // ─── Serve Static Files (your existing site) ──
     app.use(express.static(path.join(__dirname, '.')));

     // ─── Fallback to index.html ────────────────────
     app.use((req, res) => {
       res.sendFile(path.join(__dirname, 'index.html'));
     });
     ```

2. **Data Layer Architecture (`server/db/database.js`)**:
   - `database.js:5`: `const DB_PATH = path.join(__dirname, 'users.json');`
   - `database.js:12-19`: Synchronous file reads and writes using native `fs.readFileSync` and `fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2), 'utf8')`. No external database drivers or async locking libraries are present.
   - `server/db/users.json`: Contains user objects with fields `id`, `fullName`, `email`, `password` (bcrypt hash), `role` (`"customer"` | `"admin"`), `isVerified` (boolean), `createdAt`, `updatedAt`. Existing accounts include verified customers (`muntasirahmed1212@gmail.com`, `cujolly030@gmail.com`) and admin (`otp.bluecollar@gmail.com`).
   - `server/db/jobs.json`: Currently does not exist. Must be created for job persistence.

3. **Authentication & Session Tracking**:
   - In `server/controllers/authController.js:139` and `authController.js:179`, successful authentication assigns only:
     ```javascript
     req.session.userId = user.id;
     ```
   - In `server/middleware/authMiddleware.js:1-23`, `requireAuth` checks `if (req.session && req.session.userId)`. `requireAdmin` checks `req.session.userId`, reads `users = db.readUsers()`, and verifies `user.role === 'admin'`. It returns HTTP 401 for unauthenticated requests and HTTP 403 for non-admins:
     ```javascript
     if (!req.session || !req.session.userId) {
       return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
     }
     const db = require('../db/database');
     const users = db.readUsers();
     const user = users.find(u => u.id === req.session.userId);
     if (!user || user.role !== 'admin') {
       return res.status(403).json({ success: false, error: 'Admin access required.' });
     }
     next();
     ```
   - Role and verification status are queried from the database on every protected request rather than cached in the session.

4. **API Envelope & Status Conventions**:
   - Success responses format: `{ success: true, ... }` with HTTP 200 or 201.
   - Failure responses format: `{ success: false, error: '<description>' }` with HTTP 400, 401, 403, 404, or 500.
   - All handlers are wrapped in `try/catch`, logging errors to `console.error` and returning HTTP 500 on unhandled exceptions.

5. **Package Dependencies & Test Suite**:
   - `package.json` specifies `"type": "commonjs"`, `"main": "index.js"`, `"express": "^5.2.1"`, `"express-session": "^1.19.0"`, `"bcryptjs": "^3.0.3"`, `"cors": "^2.8.6"`, `"dotenv": "^18.0.3"`, `"helmet": "^8.3.0"`, `"express-rate-limit": "^8.7.0"`, `"nodemailer": "^10.0.10"`.
   - Execution of `node tests/verify-all-ac.js` passed all 6 acceptance criteria tests (exited 0).
   - Execution of `node tests/adversarial-registration.test.js` passed all 21 tests (exited 0).
   - Execution of `node tests/adversarial-secondary-db.test.js` passed all 54 tests (exited 0).
   - All tests run via pure Node.js (`node:assert/strict`), spinning up ephemeral servers on port 0 and restoring DB state via `process.on('exit')`.

---

## 2. Logic Chain

1. **Routing Logic**:
   - Because `server.js` serves static files at line 64 and has a catch-all route at line 67 returning `index.html`, mounting `app.use('/api/jobs', jobRoutes)` must occur at line 62 (right after `authRoutes`).
   - If mounted after static serving or the catch-all, API requests would inadvertently receive HTML responses instead of JSON.

2. **Authorization Logic for Job Creation**:
   - Acceptance criteria require `POST /api/jobs` to return 401 when called without a valid session, and 403 when called by a user who is not a verified customer.
   - Because `req.session` stores only `userId`, any job creation request must:
     a. Check `req.session?.userId` (if absent, return HTTP 401).
     b. Look up user by `userId` in `db.readUsers()`.
     c. If `!user || !user.isVerified || user.role !== 'customer'`, return HTTP 403.
     d. Otherwise proceed to handler with `req.user` attached.

3. **Job Persistence & Concurrency Logic**:
   - The platform uses a synchronous JSON file persistence model (`readFileSync` / `writeFileSync`).
   - Creating `server/db/jobs.json` and providing synchronous CRUD helpers in `server/db/database.js` (or `jobDatabase.js`) preserves architectural uniformity, guarantees zero external dependency overhead, and ensures data survives server restarts without in-memory caching staleness.

4. **Job Modification/Cancellation Ownership Logic**:
   - For `PATCH /api/jobs/:id` and `DELETE /api/jobs/:id`, unauthenticated users must receive 401. If the job does not exist, return 404. If the authenticated `req.session.userId` does not match `job.userId` (and is not admin), return 403. This satisfies acceptance criteria for owner-restricted cancellation and updating.

5. **Test Architecture Logic**:
   - The existing test suite (`tests/verify-all-ac.js`) demonstrates that independent verification suites in this repo use plain Node.js + `fetch` against an ephemeral Express server. Creating `tests/verify-jobs.js` using this exact pattern ensures fast, deterministic verification with zero new dependencies.

---

## 3. Caveats

1. **Vercel Serverless Function Context**:
   - Untracked file `api/auth.js` references `cookie-parser` and `jsonwebtoken`, which are not declared in `package.json` and fail locally. The primary application and acceptance criteria target `server.js` (`node server.js`). If Vercel deployment is desired downstream, `api/jobs.js` and `vercel.json` rewrites will need to be configured, and dependencies added.
2. **File Locking Under Multi-Worker Clusters**:
   - Synchronous `writeFileSync` is safe within a single Node.js process (the default development and standard deployment model), but does not use OS-level advisory file locks (`flock`). If multi-process clustering (PM2 / cluster mode) is introduced in the future, atomic write via temp file + rename will be recommended.
3. **Frontend Forbidden Files**:
   - `js/components/authUI.js` and `js/services/authService.js` are strictly forbidden from modification. Frontend job integration should create a new `js/services/jobService.js` and integrate cleanly into header, modal, and page scripts.

---

## 4. Conclusion

The backend architecture is clean, consistent, and ready for the "Post Jobs" feature:
1. **Persistence**: Store job postings in `server/db/jobs.json` using synchronous methods in `server/db/database.js` (seeded with 6-8 sample jobs across existing categories).
2. **Middleware**: Add `requireCustomer` middleware in `server/middleware/authMiddleware.js` checking `userId`, `isVerified === true`, and `role === 'customer'`.
3. **Controller & Router**: Create `server/controllers/jobController.js` and `server/routes/jobs.js` implementing:
   - `POST /api/jobs` (Auth: verified customer, creates job, returns 201/200)
   - `GET /api/jobs` (Public: filters by category, urgency, location, status; sorts; supports limit)
   - `GET /api/jobs/:id` (Public: single job detail or 404)
   - `PATCH /api/jobs/:id` (Auth: owner-only update, returns 200 or 403/404)
   - `DELETE /api/jobs/:id` (Auth: owner-only cancel, returns 200 or 403/404)
4. **Server Integration**: Mount `app.use('/api/jobs', jobRoutes);` in `server.js` at line 62.
5. **Testing**: Build `tests/verify-jobs.js` covering all 8 backend acceptance criteria.

---

## 5. Verification Method

1. **Verify Backend Dependencies & Server Execution**:
   ```powershell
   node -e "require('express'); require('express-session'); require('dotenv').config(); console.log('Dependencies OK');"
   ```
2. **Verify Existing Acceptance Criteria**:
   ```powershell
   node tests/verify-all-ac.js
   ```
   *Expected Result*: All 6 AC pass; exits with status 0.
3. **Verify Database Robustness**:
   ```powershell
   node tests/adversarial-secondary-db.test.js
   ```
   *Expected Result*: All 54 tests pass; exits with status 0.
4. **Verify No Forbidden File Modifications**:
   ```powershell
   git status --porcelain js/components/authUI.js js/services/authService.js
   ```
   *Expected Result*: Empty output (zero modifications).
5. **Inspect Detailed Survey Artifact**:
   Read `c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1\survey_backend.md`.
