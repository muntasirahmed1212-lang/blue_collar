## 2026-09-25T19:29:51Z
You are explorer_m2_3.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_3
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_survey_2\survey_frontend.md

Your role is to design the wiring of all "Post a Job" buttons and the authentication check:
1. Examine js/components/modal.js lines 9-19 where .btn-primary buttons with text "post a job" are currently hooked to showToast("Post a Job feature coming soon!", "info").
2. Design the replacement logic:
   - On click of ANY "Post a Job" button (desktop header or mobile header on any of the 6 pages):
     a. Intercept click (e.preventDefault()).
     b. Check authentication status by importing authService and calling `await authService.getMe()`.
     c. If NOT authenticated (res.success is false or !res.user):
        - Show informational toast ("Please log in to post a job.", "info")
        - Open login modal via `if (window.authUI) window.authUI.openModal('login-modal');`
     d. If authenticated, verify user:
        - Check if user is verified customer (`res.user.role === 'customer'`). (Note: users with valid session are verified customers in this app; if not customer, show error toast "Only customers can post jobs.").
     e. If authenticated verified customer:
        - Open the job posting modal (`openJobModal()`).
3. Ensure zero modifications to js/components/authUI.js and js/services/authService.js.
4. Provide the exact modifications to js/components/modal.js and how it interacts with js/components/jobModal.js.

SCOPE BOUNDARIES:
- Read-only exploration. DO NOT edit source code files.
- NEVER touch js/components/authUI.js or js/services/authService.js.

OUTPUT:
Write your report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_3\plan_button_wiring.md
And write handoff to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m2_3\handoff.md
When finished, send a message to parent.
