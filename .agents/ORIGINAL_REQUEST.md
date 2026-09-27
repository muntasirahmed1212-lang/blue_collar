# Original User Request

## 2026-09-23T09:44:54Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: Full team

Implement native scroll-triggered content pop-up animations (fade-up, staggered grid reveal, scale-up, char-by-char reveal, parallax) in the BlueCollar Connect project based on the approved implementation plan. 

Working directory: c:\Users\munta\Downloads\blue_collar
Integrity mode: development

## Requirements

### R1. CSS Animation System
Create a new `scroll-animations.css` file containing pure CSS classes for scroll animations using `data-animate` attributes. Ensure all animations are gated behind `prefers-reduced-motion: no-preference`. Include animations for `fade-up`, `scale-up`, and character-by-character reveals.

### R2. Refactor Animation Engine
Update `js/utils/animations.js` to use a robust `IntersectionObserver` that supports dynamically rendered elements via a new `observeNewElements(container)` function to fix the existing race condition. Implement `initHeroParallax()` for the hero section fade-out/shrink effect, and `initCharReveal()` for section titles.

### R3. HTML and Dynamic Rendering Updates
Add `data-animate` attributes to static HTML elements across all pages, and inject them into the dynamic JS template literals in the `js/pages/*.js` files. Ensure `observeNewElements()` is called after dynamic content is injected into the DOM.
- The Hero section should have parallax fade-out.
- Section titles should use character-by-character reveal (`data-char-reveal`).
- The CTA card on the homepage should use the `scale-up` animation.

### R4. Zero Dependencies
The implementation must remain completely native. No external animation libraries (e.g., GSAP, Framer Motion) can be added to the project.

## Acceptance Criteria

### Verification (Agent-as-Judge via Browser Tool)
- [ ] An independent auditing agent must load the local HTML files in a browser (e.g. using the chrome-devtools plugin or similar visual tool) and confirm that scrolling down triggers the animation states (elements change from `opacity: 0` to `opacity: 1` with the correct classes applied).
- [ ] The auditor must verify that dynamically injected cards (e.g. category grids) receive the `is-visible` class upon intersection.
- [ ] The auditor must verify that the hero section's inline `opacity` and `transform` values update dynamically as the page is scrolled.
- [ ] The auditor must verify that no existing fixed (`header`) or sticky positioned elements (`category.html` sidebar) are broken or hidden by overflow constraints.

## 2026-09-24T08:53:36Z

# Teamwork Project Prompt — Final

> Status: Ready for launch — awaiting user approval
> Goal: Fix login modal bug and ensure zero regressions
> Requested team: Small, focused team

This is a single self-contained fix; keep it small and focused.
Implement the login modal bug fix plan (`login-modal-fix-plan.md`) to resolve the auto-closing issue, ensuring the fix is robust and no existing site functionality breaks.

Working directory: `C:\Users\munta\Downloads\blue_collar`
Integrity mode: demo

## Requirements

### R1. Eliminate Race Condition
Modify `js/components/authUI.js` to remove the `setTimeout` delayed hiding logic in `closeAllAuthModals()` and `openModal()`. Use `requestAnimationFrame` for immediate, synchronous state transitions.

### R2. Remove Duplicate Listeners
Remove the conflicting Login button event listener logic from `js/components/modal.js`.

### R3. Fix Mobile Button Support
Update the CSS selectors in `js/components/authUI.js` (`updateHeaderState`) to properly target and bind the mobile Login button (`.btn-outline`).

### R4. Zero Regressions
Ensure that the other modals (Register, Forgot Password) and non-auth modals (Post a Job, Set Location) continue to function perfectly without flashing or breaking.

## Acceptance Criteria

### Modal Stability
- [ ] Clicking the desktop "Login" button opens the modal, and it stays open indefinitely until closed.
- [ ] Clicking the mobile "Login" button opens the modal, and it stays open indefinitely until closed.
- [ ] Clicking "Post a Job" correctly shows the "coming soon" toast.
- [ ] No visual flashing occurs during modal transitions.
- [ ] No new JavaScript errors are introduced in the browser console.

## 2026-09-24T16:15:16Z

# Teamwork Project Prompt — Final

> Status: Ready for launch — awaiting user approval
> Goal: Fix registration/OTP bug with zero breaking changes
> Requested team: Full-scale multi-agent team

Implement the Registration/OTP bug fix plan (`registration-otp-fix-plan.md`) to resolve the non-atomic registration issue, fix the `forgotPassword` crash, clean up `getMe`, and add `deleteUser`. Ensure absolute backward compatibility.

Working directory: `C:\Users\munta\Downloads\blue_collar`
Integrity mode: development

## Requirements

### R1. Atomic Registration (Email First)
Modify `server/controllers/authController.js` so that `register` attempts to send the OTP email *before* saving the user to the database. If the email fails, return an error and leave the database clean.
If an unverified user record already exists for the email, delete it and allow re-registration.

### R2. Fix Secondary Bugs
- Fix `forgotPassword` `this` binding in `authController.js`.
- Refactor `getMe` to use the `db` module instead of raw `fs.readFileSync`.
- Add a `deleteUser(email)` and `readUsers()` function to `server/db/database.js`.

### R3. Strict Backward Compatibility
Make zero modifications to the frontend code (`authUI.js`, `authService.js`). The API endpoints, request bodies, and response shapes must remain identical.

## Acceptance Criteria

### API Correctness
- [ ] Attempting registration with a broken SMTP configuration returns a 500 error and does NOT add the user to `users.json`.
- [ ] Registering with an email that is already in `users.json` with `isVerified: false` succeeds (overwriting/cleaning up the stale record).
- [ ] Registering with an email that is in `users.json` with `isVerified: true` returns a 400 error "Email is already registered".
- [ ] Calling the Forgot Password endpoint successfully triggers `sendOtp` without crashing.
- [ ] Calling `/api/auth/me` while authenticated returns the correct user data.

## 2026-09-25T18:31:21Z

Add a production-ready "Post Jobs" feature to an existing Node.js/Express web platform called BlueCollar Connect. This platform connects customers with blue-collar professionals (electricians, plumbers, carpenters, etc.). The "Post a Job" button already exists in the header but is non-functional. This task implements the full flow: job posting form → save to backend → dedicated job listing page → homepage preview section. The existing project must remain fully functional — zero regressions in authentication, navigation, search, and all existing pages.

Working directory: c:\Users\munta\Downloads\blue_collar
Integrity mode: development

## Existing Architecture (Read-only context)

- **Server**: Express 5 on Node.js (`server.js`), serves static HTML + API routes
- **Auth system**: Session-based auth with OTP email verification (`/api/auth/*` routes)
- **Data layer**: JSON-file persistence (`server/db/database.js` → `server/db/users.json`)
- **Frontend**: Vanilla JS ES modules (`js/app.js` entry → `js/components/`, `js/pages/`, `js/data/`, `js/services/`, `js/utils/`)
- **Pages**: `index.html`, `services.html`, `category.html`, `professional.html`, `about.html`, `how-it-works.html`
- **CSS**: Modular CSS files in `css/` with CSS custom properties (`css/variables.css`)
- **Icons**: Lucide icons loaded from CDN
- **Deployment**: Vercel (`vercel.json`)
- **FORBIDDEN files** (do NOT modify): `js/components/authUI.js`, `js/services/authService.js`

## Requirements

### R1. Job Posting Backend API
Create backend API endpoints for job CRUD operations. Only logged-in, verified users with the "customer" role can create jobs. Jobs must include: title, description, category (one of the 12 existing categories), location, budget/price range, urgency level (low/medium/high/urgent), photos (as URLs or paths), and preferred date/time. Each job should track its status (open, in-progress, completed, cancelled), the posting user's ID, and timestamps.

### R2. Job Posting Form UI
Wire the existing "Post a Job" button (in both desktop and mobile header) to open a job posting form. The form must collect all job fields from R1, use the existing category data for a category selector, and validate inputs before submission. The form UI must match the existing site's design system (CSS variables, glass-panel style, Lucide icons). Only authenticated and verified customers should be able to access the form — unauthenticated users should be prompted to log in first.

### R3. Job Listing Page & Homepage Preview
Create a dedicated jobs page (`jobs.html`) where professionals can browse all open job postings with filtering (by category, location, urgency) and sorting (by date, budget). Also add a "Recent Jobs" preview section on the homepage (`index.html`) showing the latest 4-6 open job postings. Both views must be responsive and consistent with the existing design.

### R4. Zero Regression on Existing Features
All existing functionality must remain intact: authentication flow (register, login, OTP, forgot password, logout, getMe), navigation between all pages, search bar, location modal, theme toggle, service categories, professional profiles, mobile menu, and scroll animations. No existing files should be deleted. The `server.js` must continue to serve the existing static site and auth routes alongside the new job routes.

## Acceptance Criteria

### Backend API
- [ ] `POST /api/jobs` creates a job and returns `{ success: true, job: {...} }` when called by an authenticated, verified customer
- [ ] `POST /api/jobs` returns 401 when called without a valid session
- [ ] `POST /api/jobs` returns 403 when called by a user who is not a verified customer
- [ ] `GET /api/jobs` returns a list of all open jobs (no auth required for browsing)
- [ ] `GET /api/jobs?category=<catId>` filters jobs by category
- [ ] `GET /api/jobs/:id` returns a single job's details
- [ ] `DELETE /api/jobs/:id` or `PATCH /api/jobs/:id` allows the job owner to cancel/update their job
- [ ] Job data persists across server restarts

### Frontend — Job Posting Form
- [ ] Clicking "Post a Job" when logged in opens a job posting form (modal or new page)
- [ ] Clicking "Post a Job" when NOT logged in shows a login prompt
- [ ] The form includes fields for: title, description, category dropdown, location, budget range, urgency selector, preferred date/time
- [ ] Form validation prevents submission with empty required fields
- [ ] Successful submission shows a confirmation and the new job appears in the job listing

### Frontend — Job Listing
- [ ] `jobs.html` displays all open jobs in a card-based layout
- [ ] Jobs can be filtered by category and urgency
- [ ] Each job card shows title, category, location, budget, urgency, and time posted
- [ ] Homepage shows a "Recent Jobs" section with the latest 4-6 jobs
- [ ] Navigation header includes a link to the jobs page

### Zero Regression
- [ ] The server starts without errors (`node server.js`)
- [ ] All existing HTML pages load and render correctly (index, services, category, professional, about, how-it-works)
- [ ] Auth flows still work: register → OTP → verify → login → getMe → logout
- [ ] The search bar, theme toggle, location modal, and mobile menu remain functional
- [ ] No existing files are deleted; `authUI.js` and `authService.js` are unmodified

### Verification Test Suite
- [ ] An automated test script exists that programmatically verifies at least: job creation, job listing, auth-gated access, and regression checks on existing auth endpoints
- [ ] Tests can be run with a single command (e.g. `node tests/verify-jobs.js`)
