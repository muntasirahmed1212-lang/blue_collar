## 2026-09-25T19:59:00Z

<USER_REQUEST>
You are worker_m3.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m3
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m3_1\plan_jobs_page.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m3_2\plan_jobs_controller.md
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m3_3\plan_homepage_nav.md

YOUR MISSION: Implement Milestone M3: Job Listing Page (jobs.html) & Homepage Preview (index.html).

FILES YOU OWN EXCLUSIVELY:
- jobs.html
- css/jobs.css
- js/pages/jobs.js
- js/app.js
- index.html
- js/pages/home.js
- services.html, category.html, professional.html, about.html, how-it-works.html (adding nav link to jobs.html)

FORBIDDEN FILES (DO NOT TOUCH UNDER ANY CIRCUMSTANCES):
- js/components/authUI.js
- js/services/authService.js

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

IMPLEMENTATION DETAILS:
1. Create jobs.html using the drop-in markup from plan_jobs_page.md (full header, hero/breadcrumb, sidebar filters, #jobs-grid, empty state, footer, script tags).
2. Create css/jobs.css using the stylesheet from plan_jobs_page.md (responsive layout, job cards grid, urgency badges, glass-panel styling).
3. Create js/pages/jobs.js using the drop-in code from plan_jobs_controller.md (initJobs, getJobs call, filtering by category/urgency/location, sorting, card rendering with Lucide icons, relative timestamps, empty states, reactive subscription to 'job:created').
4. In js/app.js, add the dynamic import route for jobs.html:
   else if (path.includes('jobs.html')) {
     import('./pages/jobs.js').then(module => module.initJobs());
   }
5. In index.html, add the Recent Jobs section markup after the categories section per plan_homepage_nav.md.
6. In js/pages/home.js, implement and call renderRecentJobs() querying latest 4-6 jobs per plan_homepage_nav.md.
7. Update navigation headers: Add <a href="./jobs.html" class="nav-link">Jobs</a> in desktop .nav-links and <a href="./jobs.html" class="nav-link mobile-nav-link">Jobs</a> in mobile .mobile-nav-links across all 6 HTML pages (index, services, category, professional, about, how-it-works).
8. Write and run automated verification tests (tests/verify-m3.js) verifying:
   - jobs.html exists, contains header, sidebar filters, #jobs-grid, and links to css/jobs.css.
   - All 6 HTML pages + jobs.html contain the nav link to jobs.html.
   - index.html contains the Recent Jobs section and #recent-jobs-grid.
   - js/pages/jobs.js and js/pages/home.js pass syntax checks.
   - Run existing suites: node tests/verify-jobs.js (34/34), node tests/verify-all-ac.js (6/6), node tests/verify-m2.js (7/7).
   - Check forbidden files: git status --porcelain js/components/authUI.js js/services/authService.js (MUST BE 0 changes).

Write your handoff report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\worker_m3\handoff.md
When finished, send a message to parent summarizing what was created and verified.
</USER_REQUEST>
