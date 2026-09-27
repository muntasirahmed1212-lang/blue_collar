## 2026-09-25T18:33:19Z

You are spec_miner_survey_3.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Your role is to extract and document the complete specification and acceptance criteria for the "Post Jobs" feature.
Specifically detail:
1. All requirements: R1 (Job Posting Backend API), R2 (Job Posting Form UI), R3 (Job Listing Page & Homepage Preview), R4 (Zero Regression on Existing Features).
2. Field-level specifications for jobs (title, description, category, location, budget range, urgency level, photos, preferred date/time, status, customer ID, timestamps).
3. Auth and permission gating rules (logged-in, verified, customer role, 401 vs 403 status codes, login prompt on frontend).
4. Test suite specifications and verification requirements (e.g. tests/verify-jobs.js, programmatic verification, server launch and shutdown).
5. All edge cases, boundary conditions, and potential regression risks.
6. Forbidden constraints (js/components/authUI.js and js/services/authService.js must remain untouched).

SCOPE BOUNDARIES:
- Read-only specification extraction. DO NOT modify any source code files.
- NEVER touch or modify js/components/authUI.js or js/services/authService.js.

OUTPUT:
Write your detailed findings to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\survey_spec.md
And write your final handoff to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\spec_miner_survey_3\handoff.md
Update progress.md as you work.
When finished, send a message to parent summarizing your findings and pointing to handoff.md.
