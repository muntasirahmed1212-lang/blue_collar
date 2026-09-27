## 2026-09-26T00:15:00Z

<USER_REQUEST>
You are worker_m1.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m1
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Also read the architecture and plan documents:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_1\plan_database.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_2\plan_auth_middleware.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_3\plan_controller_router.md

YOUR MISSION: Implement Milestone M1: Backend Job CRUD API & Storage.

FILES YOU OWN EXCLUSIVELY:
- server/db/jobs.json
- server/db/database.js
- server/middleware/authMiddleware.js
- server/controllers/jobController.js
- server/routes/jobs.js
- server.js (mounting route at line 62)

FORBIDDEN FILES (DO NOT TOUCH UNDER ANY CIRCUMSTANCES):
- js/components/authUI.js
- js/services/authService.js

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

IMPLEMENTATION DETAILS:
1. Create server/db/jobs.json with initial 6-8 realistic seed jobs across the 12 categories (open status, customerId matching existing verified customers in users.json).
2. Add CRUD helpers to server/db/database.js: readJobs(), writeJobs(), findJobById(), createJob(), updateJob(), deleteJob().
3. Add requireCustomer and requireJobOwnerOrAdmin middleware to server/middleware/authMiddleware.js:
   - Check req.session && req.session.userId -> 401 if missing
   - Query user from db.readUsers() -> check user.isVerified === true && user.role === 'customer' -> 403 if not verified customer
   - Attach req.user = user
4. Create server/controllers/jobController.js:
   - POST /api/jobs: field validation (title >= 5 chars, category valid, description >= 10 chars, urgency in ['low','medium','high','urgent'], budget, location, preferredDate), status='open', customerId=req.user.id -> 201/200 { success: true, job }
   - GET /api/jobs: public, filter by category, urgency, location, status, sort (date, budget), limit -> 200 { success: true, count, total, jobs }
   - GET /api/jobs/:id: public, returns job or 404
   - PATCH /api/jobs/:id: require auth, owner-only, update job -> 200 { success: true, job }
   - DELETE /api/jobs/:id: require auth, owner-only, status='cancelled' -> 200 { success: true, message: 'Job cancelled', job }
5. Create server/routes/jobs.js wiring all endpoints.
6. Mount in server.js at line 62: app.use('/api/jobs', jobRoutes); before static file serving.
7. Verification: Run build/test checks (e.g. node tests/verify-all-ac.js to ensure 0 regression, and verify the new job endpoints respond correctly).

Write your completion handoff report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m1\handoff.md
Update progress.md as you work.
When finished, send a message to parent summarizing what was changed and verified.
</USER_REQUEST>
