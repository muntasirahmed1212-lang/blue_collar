## 2026-09-25T18:40:10Z

You are explorer_m1_2.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_2
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md
Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_1\survey_backend.md

Your role is to produce the exact technical specification and implementation plan for the Auth & Role Gating Middleware for Milestone M1:
1. Exact design and code for `requireCustomer` middleware in server/middleware/authMiddleware.js.
2. Session verification: checking `req.session && req.session.userId`. Return 401 if missing (`{ success: false, error: 'Unauthorized. Please log in.' }`).
3. User verification and role check: lookup user in db.readUsers(). Check `user.isVerified === true` and `user.role === 'customer'`.
   Return 403 if unverified or not customer (`{ success: false, error: 'Only verified customers can post jobs.' }`).
4. Attach `req.user = user` to request so downstream controller has customer ID, name, email.
5. Ownership verification helper for PATCH / DELETE (check if `req.session.userId === job.customerId` or `user.role === 'admin'`).

SCOPE BOUNDARIES:
- Read-only exploration and planning. Do NOT edit source code files.
- NEVER touch js/components/authUI.js or js/services/authService.js.

OUTPUT:
Write your report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_2\plan_auth_middleware.md
And write handoff to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m1_2\handoff.md
When finished, send a message to parent.
