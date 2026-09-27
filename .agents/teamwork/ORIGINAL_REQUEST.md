# Original User Request

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
