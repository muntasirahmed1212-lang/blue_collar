# Test Infrastructure & Verification Harness: Post Jobs Feature
**Document Owner:** `test_writer_track_t` (Track T)  
**Target Suite:** `tests/verify-jobs.js`  
**Execution Command:** `node tests/verify-jobs.js`  
**Project:** BlueCollar Connect  
**Date:** 2026-09-25  

---

## 1. Overview & Architecture

`tests/verify-jobs.js` provides an end-to-end automated verification harness for the "Post Jobs" feature in BlueCollar Connect. Designed around the architectural patterns established by existing test suites (e.g. `tests/verify-all-ac.js`), the harness is completely self-contained, requiring zero external test runner frameworks (such as Jest or Mocha) and executing directly via Node.js standard modules (`node:assert/strict`, `http`, `express`, `express-session`, `bcryptjs`, and native `fetch`).

### 1.1 Core Principles
1. **Zero External Test Framework Overhead:** Uses pure Node.js v18+ native `fetch` and `node:assert/strict`.
2. **Ephemeral Dynamic Port Binding (`port: 0`):** Spins up in-memory Express instances dynamically bound to OS-assigned free ports (`127.0.0.1:0`), guaranteeing zero port collisions with running servers or other processes.
3. **Database Isolation & Reversible Rollback:**
   - Backs up `server/db/users.json` and `server/db/jobs.json` prior to test execution.
   - Automatically restores pristine file state on process exit, normal completion, or unexpected interruption (`SIGINT`/`SIGTERM`).
4. **Mocked Email Delivery:** Stubs `emailService.sendOTPEmail` during test execution to prevent external SMTP network delays or connection failures.
5. **Progressive Testability (Pre-M1 vs Post-M1 Readiness):**
   - Automatically detects whether `server/routes/jobs.js` is present.
   - If not yet implemented (pre-M1), routes diagnostic 404 responses for `/api/jobs` endpoints, allowing the entire suite to run, report baseline failures for unimplemented features, and pass regression tests without crashing.
   - Once M1 implements `server/routes/jobs.js`, the suite seamlessly mounts the real routes and validates the full backend implementation against all criteria.

---

## 2. Test Hierarchy & Tier Structure

The test suite contains **34 automated test cases** organized across four distinct tiers:

### Tier 1: Feature Coverage (CRUD & Filtering) — 7 Tests
Verifies the functional contract for all jobs endpoints:
- `T1.1`: `POST /api/jobs` creates job with all required and optional fields (status `open`, customerId, timestamps).
- `T1.2`: `GET /api/jobs` lists open jobs publicly without requiring authentication.
- `T1.3`: `GET /api/jobs/:id` retrieves single job details.
- `T1.4`: `PATCH /api/jobs/:id` allows owner to update job fields (e.g. title, urgency).
- `T1.5`: `DELETE /api/jobs/:id` allows owner to cancel or delete job.
- `T1.6`: `GET /api/jobs?category=cat-1` filters jobs strictly by service category.
- `T1.7`: `GET /api/jobs?urgency=high` filters jobs strictly by urgency level.

### Tier 2: Boundary & Corner Cases (Auth, Roles, Validation, 404) — 18 Tests
Verifies access control, role authorization, validation rules, and error handling:
- `T2.1`: `401 Unauthorized` for unauthenticated `POST /api/jobs`.
- `T2.2`: `401 Unauthorized` for unauthenticated `PATCH /api/jobs/:id`.
- `T2.3`: `401 Unauthorized` for unauthenticated `DELETE /api/jobs/:id`.
- `T2.4`: `403 Forbidden` for authenticated unverified customer (`isVerified: false`) on `POST /api/jobs`.
- `T2.5`: `403 Forbidden` for authenticated non-customer role (`role: 'professional'`) on `POST /api/jobs`.
- `T2.6`: `403 Forbidden` for non-owner attempting `PATCH /api/jobs/:id`.
- `T2.7`: `403 Forbidden` for non-owner attempting `DELETE /api/jobs/:id`.
- `T2.8`: `404 Not Found` for `GET /api/jobs/:id` with nonexistent ID.
- `T2.9`: `404 Not Found` for `PATCH /api/jobs/:id` with nonexistent ID.
- `T2.10`: `404 Not Found` for `DELETE /api/jobs/:id` with nonexistent ID.
- `T2.11`: `400 Bad Request` on `POST /api/jobs` with missing title.
- `T2.12`: `400 Bad Request` on `POST /api/jobs` with title too short (< 3 characters).
- `T2.13`: `400 Bad Request` on `POST /api/jobs` with missing category.
- `T2.14`: `400 Bad Request` on `POST /api/jobs` with invalid category ID (e.g. `cat-999`).
- `T2.15`: `400 Bad Request` on `POST /api/jobs` with missing description.
- `T2.16`: `400 Bad Request` on `POST /api/jobs` with description too short (< 10 characters).
- `T2.17`: `400 Bad Request` on `POST /api/jobs` with invalid urgency level (e.g. `super-turbo-urgent`).
- `T2.18`: `400 Bad Request` on `POST /api/jobs` with invalid budget range (minimum budget > maximum budget).

### Tier 3: Cross-Feature & Persistence — 3 Tests
Verifies multi-user isolation, file-based persistence, and process lifecycle resilience:
- `T3.1`: Disk persistence: verifies that `POST /api/jobs` immediately writes and serializes the job record into `server/db/jobs.json` on disk.
- `T3.2`: Restart persistence: shuts down the running Express server, boots a brand new server on a new ephemeral port, and verifies that `GET /api/jobs/:id` successfully reads the job created before shutdown.
- `T3.3`: Multi-user isolation & cross-user authorization: Customer A creates a job; Customer B attempts to modify (`PATCH`) or cancel (`DELETE`) it and receives `403 Forbidden`; Customer A logs back in and successfully cancels (`DELETE`) with `200 OK`.

### Tier 4: Regression Checks — 6 Tests
Verifies zero regression on all existing platform functionality and strict file immutability:
- `T4.1`: Existing auth endpoint `GET /api/auth/me` returns `401` unauthenticated.
- `T4.2`: Existing auth endpoint `POST /api/auth/register` sends OTP and registers user.
- `T4.3`: Existing auth endpoint `POST /api/auth/login` returns valid session cookie and user profile.
- `T4.4`: Existing auth endpoint `GET /api/auth/me` with session returns user profile (omits password).
- `T4.5`: Existing auth endpoint `POST /api/auth/logout` terminates session and invalidates cookie.
- `T4.6`: Protected frontend files immutability: verifies via `git status --porcelain` that `js/components/authUI.js` and `js/services/authService.js` have 0 modifications.

---

## 3. Session & Authentication Harness

To test session-gated endpoints accurately without depending on manual UI interactions:
1. **Pre-Seeded Test Personas:**
   - **Alice:** Verified customer (`alice@jobs-test.example.com`, role: `'customer'`, `isVerified: true`).
   - **Bob:** Verified customer (`bob@jobs-test.example.com`, role: `'customer'`, `isVerified: true`).
   - **Charlie:** Unverified customer (`charlie@jobs-test.example.com`, role: `'customer'`, `isVerified: false`).
   - **Dan:** Verified professional (`dan@jobs-test.example.com`, role: `'professional'`, `isVerified: true`).
2. **Session Acquisition:**
   - Alice, Bob, and Dan authenticate via legitimate `POST /api/auth/login` HTTP calls to acquire real session cookies (`connect.sid`).
   - Charlie's unverified session is bound via a test-harness-only session route `POST /__test__/session` to test edge-case authorization against unverified accounts.

---

## 4. Execution Protocol

Run the test suite with a single command:
```bash
node tests/verify-jobs.js
```

### Exit Codes:
- `0`: All 34 tests passed.
- `1`: One or more tests failed.
