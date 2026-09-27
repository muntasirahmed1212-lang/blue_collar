# Project: BlueCollar Connect — Post Jobs Feature

## Architecture
- **Server**: Express 5 on Node.js (`server.js`), session-based auth via `express-session`, rate-limited JSON API.
- **Persistence**: File-based JSON storage (`server/db/jobs.json`, `server/db/users.json`) with synchronous read/write operations in `server/db/database.js`.
- **API Routing**: `server/routes/jobs.js` handled by `server/controllers/jobController.js` and protected by `server/middleware/authMiddleware.js`.
- **Frontend Architecture**: Vanilla JS ES modules.
  - Entry point `js/app.js` with dynamic page imports.
  - Shared data `js/data/categories.js` (12 categories).
  - Component layer: `js/components/modal.js`, `js/components/jobModal.js`, `js/components/header.js`.
  - Service layer: `js/services/jobService.js` (calling `/api/jobs`), existing `authService.js` (strictly read-only/unmodified).
  - Page controllers: `js/pages/home.js` (recent jobs preview), `js/pages/jobs.js` (dedicated job browsing & filtering).
- **CSS Styling**: `css/variables.css`, `css/components.css`, `css/jobs.css` utilizing `.glass-panel`, `.modal-overlay`, and design system tokens.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Job Data Schema & Storage | Persistent JSON storage (`jobs.json`) with CRUD helpers in `database.js` | M1 | Survey / R1 |
| 2 | Auth & Role Gating Middleware | `requireCustomer` middleware enforcing session authentication, email verification, and customer role | M1 | Survey / R1 |
| 3 | Job Creation Endpoint | `POST /api/jobs` creating job, validating fields, returning 201/200, 401 unauthenticated, 403 unverified/non-customer, 400 validation error | M1 | Survey / R1 |
| 4 | Job Listing & Filter Endpoint | `GET /api/jobs` returning open jobs with category, urgency, location, sort, and limit query filters | M1 | Survey / R1 |
| 5 | Single Job Details Endpoint | `GET /api/jobs/:id` returning single job object or 404 | M1 | Survey / R1 |
| 6 | Job Update & Cancellation Endpoints | `PATCH /api/jobs/:id` and `DELETE /api/jobs/:id` restricted to job owner or admin | M1 | Survey / R1 |
| 7 | Job Client Service | `js/services/jobService.js` implementing API calls for job CRUD | M2 | Survey / R2 |
| 8 | Job Modal Component & Validation | Modal UI collecting title, category, description, location, budget range, urgency, preferred date/time, photos with client validation | M2 | Survey / R2 |
| 9 | Header Post a Job Buttons Wiring | Wire desktop and mobile "Post a Job" buttons across all pages; prompt login modal if unauthenticated; open job modal if verified customer | M2 | Survey / R2 |
| 10 | Dedicated Job Listing Page | `jobs.html` with responsive layout, sidebar filters (category, urgency), sort controls, and job cards | M3 | Survey / R3 |
| 11 | Homepage Recent Jobs Preview | `index.html` section showing 4–6 latest open jobs populated dynamically in `home.js` | M3 | Survey / R3 |
| 12 | Navigation Header Updates | Add "Jobs" navigation link to desktop and mobile menus across all HTML pages | M3 | Survey / R3 |
| 13 | E2E Automated Verification Test Suite | `tests/verify-jobs.js` covering full CRUD, auth gating, persistence across restarts, and existing feature regressions | Track T / M4 | Survey / R4 |
| 14 | Zero Regression Verification | Unmodified `authUI.js` and `authService.js`, all existing auth endpoints pass, all 6 existing pages load | M4 | Survey / R4 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| T | E2E Testing Suite | Requirements-driven automated test runner `tests/verify-jobs.js` covering Tiers 1-4 | none | DONE |
| M1 | Backend Job CRUD API & Storage | `server/db/jobs.json`, `server/db/database.js`, `server/middleware/authMiddleware.js`, `server/controllers/jobController.js`, `server/routes/jobs.js`, `server.js` | none | DONE |
| M2 | Job Posting Form UI & Modal Wiring | `js/services/jobService.js`, `js/components/jobModal.js`, `js/components/modal.js`, CSS styling | M1 | DONE |
| M3 | Job Listing Page & Homepage Preview | `jobs.html`, `js/pages/jobs.js`, `js/app.js`, `index.html`, `js/pages/home.js`, nav links | M1, M2 | DONE |
| M4 | Final Milestone (100% E2E Pass & Zero Regression) | Verification against `tests/verify-jobs.js`, `tests/verify-all-ac.js`, adversarial coverage hardening | T, M1, M2, M3 | IN_PROGRESS |

## Interface Contracts

### Backend API (`/api/jobs`)
- `POST /api/jobs`:
  - Request Headers: `Content-Type: application/json`, Cookie (session)
  - Request Body: `{ title, description, category, location, budget, urgency, photos, preferredDate }`
  - Success Response (201/200): `{ success: true, job: { id, title, description, category, location, budget, urgency, photos, preferredDate, status: 'open', customerId, customerName, createdAt, updatedAt } }`
  - Error Responses:
    - 401 Unauthorized: `{ success: false, error: 'Unauthorized. Please log in.' }`
    - 403 Forbidden: `{ success: false, error: 'Only verified customers can post jobs.' }`
    - 400 Bad Request: `{ success: false, error: '<validation message>' }`
- `GET /api/jobs`:
  - Query params: `category`, `urgency`, `location`, `status` (default 'open'), `sort` (date, budget), `limit`
  - Response (200): `{ success: true, count: N, jobs: [...] }`
- `GET /api/jobs/:id`:
  - Response (200): `{ success: true, job: {...} }`
  - Response (404): `{ success: false, error: 'Job not found' }`
- `PATCH /api/jobs/:id`:
  - Gated to owner (`job.customerId === req.session.userId`) or admin
  - Response (200): `{ success: true, job: {...} }`
- `DELETE /api/jobs/:id`:
  - Gated to owner or admin
  - Response (200): `{ success: true, message: 'Job cancelled successfully', job: {...} }`

### Frontend Client Service (`js/services/jobService.js`)
- `jobService.createJob(jobData)` -> returns `{ success: true, job }`
- `jobService.getJobs(params)` -> returns `{ success: true, jobs }`
- `jobService.getJobById(id)` -> returns `{ success: true, job }`
- `jobService.updateJob(id, updates)` -> returns `{ success: true, job }`
- `jobService.cancelJob(id)` -> returns `{ success: true }`

### Code Layout & File Boundaries
- Exclusive to M1:
  - `server/db/jobs.json`
  - `server/controllers/jobController.js`
  - `server/routes/jobs.js`
  - Updates in `server/db/database.js`, `server/middleware/authMiddleware.js`, `server.js`
- Exclusive to M2:
  - `js/services/jobService.js`
  - `js/components/jobModal.js`
  - Updates in `js/components/modal.js`, `css/components.css`
- Exclusive to M3:
  - `jobs.html`
  - `js/pages/jobs.js`
  - Updates in `js/app.js`, `index.html`, `js/pages/home.js`, all HTML headers (nav links)
- Exclusive to Track T:
  - `tests/verify-jobs.js`
- FORBIDDEN (No agent may touch):
  - `js/components/authUI.js`
  - `js/services/authService.js`
