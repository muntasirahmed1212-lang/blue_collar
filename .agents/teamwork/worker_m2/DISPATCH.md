## 2026-09-25T19:35:00Z
You are worker_m2.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m2
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_1\plan_job_service.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_2\plan_job_modal.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_3\plan_button_wiring.md

YOUR MISSION: Implement Milestone M2: Job Posting Form UI & Modal Wiring.

FILES YOU OWN EXCLUSIVELY:
- js/services/jobService.js
- js/components/jobModal.js
- js/components/modal.js
- css/components.css
- js/app.js (additive initialization of initJobModal)

FORBIDDEN FILES (DO NOT TOUCH UNDER ANY CIRCUMSTANCES):
- js/components/authUI.js
- js/services/authService.js

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

IMPLEMENTATION DETAILS:
1. Create js/services/jobService.js using the drop-in code in plan_job_service.md (createJob, getJobs, getJobById, updateJob, cancelJob with credentials: 'include').
2. Create js/components/jobModal.js using the drop-in code in plan_job_modal.md (DOM creation, 12 categories from categories.js, location pre-fill, budget min/max, urgency selector, live validation, createJob call, toast, reset, custom event 'job:created').
3. Add modal styles to css/components.css per plan_job_modal.md (glass-panel styling, urgency selector cards, budget input row, spin keyframes).
4. Update js/components/modal.js per plan_button_wiring.md to wire all "Post a Job" buttons across desktop and mobile headers:
   - On click, check auth via `await authService.getMe()`.
   - If not authenticated: show info toast ("Please log in to post a job.", "info") and open login modal (`window.authUI.openModal('login-modal')`).
   - If authenticated customer: open job modal (`openJobModal()`).
   - If authenticated non-customer: show error toast ("Only customers can post jobs.", "error").
5. In js/app.js, import and initialize initJobModal() alongside existing components.

TEST & VERIFY:
- Run: node --check js/services/jobService.js
- Run: node --check js/components/jobModal.js
- Run: node --check js/components/modal.js
- Run: node --check js/app.js
- Run: node tests/verify-jobs.js (must pass 34/34)
- Run: node tests/verify-all-ac.js (must pass 6/6)
- Run: git status --porcelain js/components/authUI.js js/services/authService.js (MUST BE COMPLETELY EMPTY)

Write your handoff report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m2\handoff.md
When finished, send a message to parent summarizing what was created, wired, and verified.
