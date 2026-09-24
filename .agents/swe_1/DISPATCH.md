## 2026-09-24T08:55:07Z
<USER_REQUEST>
You are the SWE Light Orchestrator (`swe_1`) for this task.
Your working directory is: c:\Users\munta\Downloads\blue_collar\.agents\swe_1
Project root directory is: c:\Users\munta\Downloads\blue_collar
The original user request is recorded in: c:\Users\munta\Downloads\blue_collar\.agents\ORIGINAL_REQUEST.md

Your task is to implement the login modal bug fix and ensure zero regressions per the user specifications:
- Goal: Fix login modal bug and ensure zero regressions
- Integrity mode: demo

Requirements:
- R1. Eliminate Race Condition: Modify js/components/authUI.js to remove the setTimeout delayed hiding logic in closeAllAuthModals() and openModal(). Use requestAnimationFrame for immediate, synchronous state transitions.
- R2. Remove Duplicate Listeners: Remove the conflicting Login button event listener logic from js/components/modal.js.
- R3. Fix Mobile Button Support: Update the CSS selectors in js/components/authUI.js (updateHeaderState) to properly target and bind the mobile Login button (.btn-outline).
- R4. Zero Regressions: Ensure that the other modals (Register, Forgot Password) and non-auth modals (Post a Job, Set Location) continue to function perfectly without flashing or breaking.

Acceptance Criteria:
- Modal Stability:
  - Clicking the desktop "Login" button opens the modal, and it stays open indefinitely until closed.
  - Clicking the mobile "Login" button opens the modal, and it stays open indefinitely until closed.
  - Clicking "Post a Job" correctly shows the "coming soon" toast.
  - No visual flashing occurs during modal transitions.
  - No new JavaScript errors are introduced in the browser console.

Maintain progress in c:\Users\munta\Downloads\blue_collar\.agents\swe_1\progress.md and your BRIEFING.md.
Execute your SWE Light loop (implementer, reviewer rounds, test verification) and report back with your completion report when done.
</USER_REQUEST>
