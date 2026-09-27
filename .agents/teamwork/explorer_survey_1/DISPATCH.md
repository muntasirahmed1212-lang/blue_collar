## 2026-09-25T18:33:19Z
You are explorer_survey_1.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Your role is to conduct a thorough technical investigation of the backend architecture of BlueCollar Connect for the "Post Jobs" feature.
Specifically investigate:
1. server.js, routing, middleware, session handling, static file serving.
2. The data layer in server/ (e.g., server/db/database.js, JSON storage like users.json, file operations, locking/async patterns).
3. How user sessions and authentication are tracked on the server: how req.session is populated, how user verification status and role ('customer') are checked.
4. How existing APIs are structured (request/response format, error handling, status codes).
5. Exact CRUD endpoints needed for jobs (POST /api/jobs, GET /api/jobs, GET /api/jobs/:id, DELETE/PATCH /api/jobs/:id) and persistence requirements (persisting across server restarts).
6. Package dependencies in package.json and how the server is run/tested.

SCOPE BOUNDARIES:
- Read-only exploration. DO NOT modify any source code files.
- NEVER touch or modify js/components/authUI.js or js/services/authService.js.

OUTPUT:
Write your detailed findings to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1\survey_backend.md
And write your final handoff to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1\handoff.md
Update progress.md as you work.
When finished, send a message to parent summarizing your findings and pointing to handoff.md.
