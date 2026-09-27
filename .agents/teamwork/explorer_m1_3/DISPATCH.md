## 2026-09-26T00:10:10Z

You are explorer_m1_3.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_3
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md
Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1\survey_backend.md

Your role is to produce the exact technical specification and implementation plan for the Controller & Router for Milestone M1:
1. Exact endpoints:
   - `POST /api/jobs`: validate required fields (title >= 5 chars, category valid in cat-1..cat-12, description, location, urgency in ['low', 'medium', 'high', 'urgent'], budget, preferredDate). Return 400 if invalid. Create job with UUID, timestamps, status='open', customerId=req.user.id. Return 201/200 `{ success: true, job }`.
   - `GET /api/jobs`: public access. Support query filtering: `category`, `urgency`, `location`, `status` (default 'open'), `sort` (newest first by default, or budget), `limit`. Return 200 `{ success: true, count, jobs }`.
   - `GET /api/jobs/:id`: public access. Return 200 `{ success: true, job }` or 404 `{ success: false, error: 'Job not found' }`.
   - `PATCH /api/jobs/:id`: require auth, check ownership, apply updates. Return 200 `{ success: true, job }`.
   - `DELETE /api/jobs/:id`: require auth, check ownership, update status='cancelled' or delete. Return 200 `{ success: true, message: 'Job cancelled' }`.
2. Router structure in server/routes/jobs.js and mounting in server.js at line 62 (`app.use('/api/jobs', jobRoutes);`).
3. Error handling and status code standardization.

SCOPE BOUNDARIES:
- Read-only exploration and planning. Do NOT edit source code files.
- NEVER touch js/components/authUI.js or js/services/authService.js.

OUTPUT:
Write your report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_3\plan_controller_router.md
And write handoff to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_3\handoff.md
When finished, send a message to parent.
