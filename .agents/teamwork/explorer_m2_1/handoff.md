# Handoff Report: Frontend Job Client Service Design

**Agent**: `explorer_m2_1`  
**Working Directory**: `c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_1`  
**Target File**: `js/services/jobService.js`  
**Handoff Type**: Hard (Task Complete)  

---

## 1. Observation

1. **Existing Service Architecture (`js/services/authService.js:1-18`)**:
   - `const API_BASE = '/api/auth';`
   - `fetchWithJSON(url, options = {})` sets `Content-Type: application/json` and returns `response.json()`.
   - Modern browser fetch defaults to `'same-origin'` credentials, but `server.js:34` explicitly configures `cors({ credentials: true })` and `server.js:46-50` configures session cookies.
   - Calling `response.json()` directly without handling non-JSON content types or network dropouts causes unhandled rejections if the server returns HTML (e.g. 502 Bad Gateway) or network fails.

2. **Server Rate Limiter Response (`server.js:54-58`)**:
   ```javascript
   const globalLimiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100,
     message: { error: 'Too many requests, please try again later.' }
   });
   ```
   - Rate limit responses return `{ error: '...' }` (HTTP status 429) without an explicit `success: false` boolean. A client that relies solely on `data.success === false` without checking `response.ok` would fail to recognize the rate-limit failure.

3. **Backend Job API Routes (`server/routes/jobs.js:7-24`)**:
   - `GET /api/jobs` -> `jobController.getJobs` (Public)
   - `GET /api/jobs/:id` -> `jobController.getJobById` (Public)
   - `POST /api/jobs` -> `requireCustomer`, `jobController.createJob` (Protected: verified customer session)
   - `PATCH /api/jobs/:id` -> `requireAuth`, `jobController.updateJob` (Protected: job owner or admin session)
   - `DELETE /api/jobs/:id` -> `requireAuth`, `jobController.deleteJob` (Protected: job owner or admin session)

4. **Backend Job Controller Query & Body Handling (`server/controllers/jobController.js`)**:
   - `POST /api/jobs`: Validates `title` (>=5 chars), `category` (`cat-1`..`cat-12` or slug), `description` (>=10 chars), `location` (>=2 chars), `urgency` (`low`, `medium`, `high`, `urgent`), `budget` (positive number or valid range string/object), optional `photos`, `preferredDate`, `preferredTime`. Returns 201 with `{ success: true, job }`.
   - `GET /api/jobs`: Supports query params `category`, `urgency`, `location`, `status` (default `'open'`), `sort` (`'newest'`, `'oldest'`, `'budget'`, `'budget-desc'`, `'budget-asc'`), `limit`. Returns 200 with `{ success: true, count, total, jobs }`.
   - `GET /api/jobs/:id`: Returns 200 `{ success: true, job }` or 404 `{ success: false, error: 'Job not found' }`.
   - `PATCH /api/jobs/:id`: Validates ownership or admin role. Updates job fields and returns 200 `{ success: true, job }`.
   - `DELETE /api/jobs/:id`: Soft-cancels job. Returns 200 `{ success: true, message: 'Job cancelled', job }`.

5. **Automated Verification Suite (`tests/verify-jobs.js`)**:
   - Running `node tests/verify-jobs.js` executed 34 tests across Tiers 1-4 with 100% pass rate:
     - Tier 1: 7/7 passed (CRUD & filters)
     - Tier 2: 18/18 passed (boundary, corner cases, auth gating, validation, 404)
     - Tier 3: 3/3 passed (disk serialization, restart persistence, multi-user isolation)
     - Tier 4: 6/6 passed (auth regression checks, zero changes to `authUI.js` and `authService.js`).

6. **Frontend Auth & Protection Boundaries (`PROJECT.md:89-92`)**:
   - `js/components/authUI.js` and `js/services/authService.js` are strictly forbidden to modify.
   - Any client-side auth checks can query `authService.getMe()` and invoke `window.authUI.openModal('login-modal')` without modifying protected files.

---

## 2. Logic Chain

1. **Step 1: Alignment with Existing Service Conventions**:
   - Observation 1 demonstrates that all frontend API services reside in `js/services/` and use standard ES module exports (`export const serviceName = { ... }`).
   - `jobService.js` must mirror this layout: standard ES module, zero dependencies, exported as both named exports, `jobService` object, and default export.

2. **Step 2: Guaranteeing Session Propagation**:
   - Observations 1 and 3 establish that `POST /api/jobs`, `PATCH /api/jobs/:id`, and `DELETE /api/jobs/:id` require active session authentication (`req.session.userId`).
   - While same-origin fetch automatically sends cookies in modern browsers, explicitly specifying `credentials: 'include'` guarantees that session cookies are transmitted across dev servers, reverse proxies, and preview environments.

3. **Step 3: Query Parameter Construction**:
   - Observation 4 details that `GET /api/jobs` accepts 6 query parameters (`category`, `urgency`, `location`, `status`, `sort`, `limit`).
   - Using `new URLSearchParams()` while stripping empty, null, or undefined values guarantees clean, standard URLs (e.g. `/api/jobs?category=cat-1&limit=6`) without polluting the backend with malformed queries.

4. **Step 4: Error Envelope Normalization**:
   - Observation 2 revealed that global rate limiting (429) returns `{ error: '...' }` without `success: false`.
   - Furthermore, network dropouts or upstream HTML error pages cause raw `response.json()` to crash.
   - Therefore, `fetchWithJSON` in `jobService.js` must:
     a) Check `response.ok` (HTTP status < 400).
     b) Safely attempt JSON parsing with fallback to text or status text.
     c) Guarantee `success: false` and a human-readable `error` string on any non-2xx status code.
     d) Catch low-level network errors and normalize them to `{ success: false, status: 0, error: 'Network error...' }`.

5. **Step 5: Caller Ergonomics**:
   - Frontend components (`jobModal.js`, `home.js`, `jobs.js`) primarily use the `if (res.success) ... else ...` pattern matching `authUI.js`.
   - Providing standardized return values by default while offering `{ throwOnError: true }` and exporting `JobApiError` gives implementers the flexibility to use either return checks or `try/catch` idioms without breaking consistency.

---

## 3. Caveats

1. **Read-Only Scope**:
   - In accordance with explorer subagent boundaries, `js/services/jobService.js` was NOT written directly to `js/services/`. The drop-in implementation code is fully prepared in `plan_job_service.md` for Milestone 2 implementers (`implementer_m2_1`).
2. **Browser Storage for User Location**:
   - `jobService.js` accepts `location` as part of `jobData` or `params`. Pre-populating default location from `localStorage.getItem('user-location')` should be handled by `jobModal.js` or `jobs.js` at the UI layer.

---

## 4. Conclusion

The frontend job client service `js/services/jobService.js` has been completely designed and specified with exact drop-in implementation code in `plan_job_service.md`. It covers:
- `createJob(jobData)`: `POST /api/jobs` with JSON payload and session credentials
- `getJobs(params)`: `GET /api/jobs` with multi-parameter query string building
- `getJobById(id)`: `GET /api/jobs/:id` with path encoding and 404 handling
- `updateJob(id, updates)`: `PATCH /api/jobs/:id` for owner/admin updates
- `cancelJob(id)` / `deleteJob(id)`: `DELETE /api/jobs/:id` for job cancellation
- Robust normalization of error envelopes (400, 401, 403, 404, 429, 500, and offline network errors) into `{ success: false, error, status }`.
- Zero modifications to protected files (`authUI.js` and `authService.js`).

---

## 5. Verification Method

1. **Verify Test Suite Baseline**:
   ```bash
   node tests/verify-jobs.js
   ```
   *Expected outcome*: All 34 tests across Tiers 1-4 pass.

2. **Verify Protected Files Invariance**:
   ```bash
   git status --porcelain js/components/authUI.js js/services/authService.js
   ```
   *Expected outcome*: Clean output (no changes).

3. **Verify Plan Document**:
   Inspect `c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_1\plan_job_service.md` to confirm the complete drop-in implementation code is present in Section 6.
