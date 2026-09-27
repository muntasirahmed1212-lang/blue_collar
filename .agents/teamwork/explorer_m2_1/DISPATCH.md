## 2026-09-25T19:29:50Z
You are explorer_m2_1.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_1
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_2\survey_frontend.md

Your role is to design the frontend job client service: js/services/jobService.js.
Specifically:
1. Examine js/services/ directory structure and how API calls are made (fetch with json, credentials include).
2. Design jobService methods:
   - createJob(jobData): POST /api/jobs
   - getJobs(params): GET /api/jobs with query string
   - getJobById(id): GET /api/jobs/:id
   - updateJob(id, updates): PATCH /api/jobs/:id
   - cancelJob(id): DELETE /api/jobs/:id
3. Handle error envelopes ({ success: false, error: '...' }) and throw or return standardized responses.
4. Provide exact drop-in implementation code for js/services/jobService.js.

SCOPE BOUNDARIES:
- Read-only exploration. DO NOT edit source code files.
- NEVER touch js/components/authUI.js or js/services/authService.js.

OUTPUT:
Write your report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_1\plan_job_service.md
And write handoff to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_1\handoff.md
When finished, send a message to parent.
