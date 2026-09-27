## 2026-09-25T18:40:10Z
You are test_writer_track_t.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\test_writer_track_t
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md
Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\survey_spec.md

Your role is to build the comprehensive automated test suite for the "Post Jobs" feature: tests/verify-jobs.js.
The test suite must be executable via:
node tests/verify-jobs.js
Follow the design pattern used in existing test suites like tests/verify-all-ac.js (spins up ephemeral server on port 0 using server.js or an express app importing the routes, makes http/fetch requests, handles sessions/cookies).

Requirements to cover across Tiers 1-4:
- Tier 1: Feature Coverage (POST /api/jobs creates job with all fields; GET /api/jobs lists open jobs; GET /api/jobs/:id returns single job; PATCH /api/jobs/:id updates job; DELETE /api/jobs/:id cancels job; GET /api/jobs?category=cat-1 filters by category; GET /api/jobs?urgency=high filters by urgency).
- Tier 2: Boundary & Corner Cases (401 unauthenticated for POST/PATCH/DELETE; 403 unverified user or non-customer for POST; 403 non-owner for PATCH/DELETE; 404 for nonexistent job id; 400 validation error for missing title/category/invalid urgency).
- Tier 3: Cross-Feature & Persistence (Create job -> restart server or verify jobs.json on disk -> read back job; verify job owner can cancel, but other users cannot).
- Tier 4: Regression Checks (existing auth endpoints /api/auth/register, /login, /me still function; check that js/components/authUI.js and js/services/authService.js are 100% unmodified).

Write the test file: tests/verify-jobs.js.
Write TEST_INFRA.md and TEST_READY.md in c:\Users\munta\Downloads\blue_collar\.agents\teamwork\test_writer_track_t/ (and publish TEST_READY.md at project root c:\Users\munta\Downloads\blue_collar\.agents\teamwork\TEST_READY.md).
Write your handoff report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\test_writer_track_t\handoff.md

SCOPE BOUNDARY:
- Do NOT modify implementation code (server.js, js/, css/, server/controllers, etc.). You write the test suite tests/verify-jobs.js!
When finished, send a message to parent.
