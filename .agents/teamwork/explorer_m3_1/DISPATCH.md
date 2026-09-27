## 2026-09-25T19:51:50Z
You are explorer_m3_1.
Working directory: c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m3_1
Workspace root: c:\Users\munta\Downloads\blue_collar

MANDATORY FIRST STEP: Read the user request file at:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\PROJECT.md

Your role is to design the dedicated job listing page: jobs.html and its styling (css/jobs.css):
1. Examine existing pages like services.html and category.html to mirror the exact structure:
   - Header with desktop & mobile nav, theme toggle, location selector, auth buttons, Post a Job button
   - Breadcrumb / Hero banner section ("Browse Open Jobs")
   - Main layout with sidebar filters (.sidebar-filters.glass-panel) and job cards grid (#jobs-grid)
   - Sidebar filters: category checkboxes/select (12 categories), urgency filter (all, urgent, high, medium, low), location search input, sort selector (newest, oldest, budget high-to-low, budget low-to-high)
   - Empty state markup when no jobs match filters
   - Footer matching other pages
2. Design responsive job card HTML structure:
   - Category badge with icon and name
   - Job title
   - Description excerpt
   - Meta tags: location icon + location, budget icon + budget, urgency badge (styled with appropriate color: urgent=red, high=orange, medium=blue, low=green), calendar icon + time posted (relative time like "2 hours ago")
   - Customer info (posted by customer name)
   - "Apply Now" or "View Details" action button
3. Design CSS styling for job cards, grid, and sidebar in css/jobs.css using existing CSS variables (--surface-glass, --primary, etc.).
4. Provide the exact full markup for jobs.html and full CSS for css/jobs.css.

SCOPE BOUNDARIES:
- Read-only exploration. DO NOT edit source code files.
- NEVER touch js/components/authUI.js or js/services/authService.js.

OUTPUT:
Write your report to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m3_1\plan_jobs_page.md
And write handoff to:
c:\Users\munta\Downloads\blue_collar\.agents\teamwork\explorer_m3_1\handoff.md
When finished, send a message to parent.
