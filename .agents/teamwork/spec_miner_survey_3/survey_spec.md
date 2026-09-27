# Specification Survey & Acceptance Criteria: Post Jobs Feature
**Project:** BlueCollar Connect  
**Component:** "Post Jobs" End-to-End Implementation  
**Integrity Mode:** Development  
**Document Author:** `spec_miner_survey_3`  
**Date:** 2026-09-25  

---

## 1. Executive Summary & Objective

BlueCollar Connect connects customers with verified blue-collar service professionals (such as electricians, plumbers, carpenters, etc.). While the platform features a complete session-based authentication system with OTP email verification, service catalogues, professional profiles, theme toggles, and location selection, the "Post a Job" button currently displays a static "coming soon" toast (`showToast("Post a Job feature coming soon!", "info")` in `js/components/modal.js`).

This specification formalizes the complete requirements, field definitions, API contracts, UI workflows, auth rules, testing requirements, and edge cases necessary to implement the full "Post Jobs" lifecycle:
1. **Job Posting Form:** Interactive modal/view triggered by desktop and mobile "Post a Job" buttons, gated by customer authentication.
2. **Backend Job API & Persistence:** Secure CRUD REST endpoints (`/api/jobs`) backed by persistent JSON storage (`server/db/jobs.json`).
3. **Dedicated Job Listing Page:** Responsive `jobs.html` allowing professionals and users to browse, filter (by category, urgency, location), and sort (by date, budget) all open jobs.
4. **Homepage Preview Section:** Dynamic "Recent Jobs" section on `index.html` displaying the latest 4-6 open jobs.
5. **Zero Regression:** Total preservation of existing authentication, search, location modal, responsive navigation, and strict immutability of forbidden files (`js/components/authUI.js`, `js/services/authService.js`).

---

## 2. Architectural Context & System Boundaries

### 2.1 Technology Stack & Existing Architecture
- **Runtime & Web Server:** Node.js, Express 5 (`server.js`).
- **Session & Auth Middleware:** `express-session` with `httpOnly` cookies (`connect.sid`), session-stored `userId`, bcrypt password hashing, and OTP verification via nodemailer (`server/services/emailService.js`, `server/services/otpService.js`).
- **Data Persistence:** File-based JSON database in `server/db/` (`server/db/users.json` via `server/db/database.js`).
- **Frontend Architecture:** Vanilla JavaScript ES Modules (`js/app.js` entry point, dynamically importing page modules `js/pages/*.js`).
- **CSS Architecture:** Modular CSS files using CSS custom properties (`css/variables.css`, `css/components.css`, `css/global.css`, `css/header.css`, `css/auth.css`).
- **Iconography:** Lucide Icons CDN (`lucide.createIcons()`).
- **Serverless / Deployment:** Vercel deployment with `vercel.json` rewrites and `api/` entry points.

### 2.2 Scope Boundaries & Forbidden Files
- **Strictly FORBIDDEN to modify:**
  - `js/components/authUI.js` (Protected by regression test suites `tests/verify-all-ac.js`)
  - `js/services/authService.js` (Protected by regression test suites `tests/verify-all-ac.js`)
- **Modification Allowed / Required:**
  - `server.js` (Mount `/api/jobs` routes)
  - `server/routes/jobs.js` (New routes file)
  - `server/controllers/jobController.js` (New controller file)
  - `server/db/database.js` or `server/db/jobsDatabase.js` (Data access methods for jobs)
  - `server/db/jobs.json` (JSON persistence file)
  - `server/middleware/authMiddleware.js` (Customer auth middleware or helper)
  - `js/app.js` (Route handler for `jobs.html`)
  - `js/components/modal.js` (Update "Post a Job" click handlers)
  - `js/components/jobModal.js` (New component for Job Posting Form modal)
  - `js/services/jobService.js` (New frontend API service for jobs)
  - `js/pages/home.js` (Render Recent Jobs section)
  - `js/pages/jobs.js` (New page module for `jobs.html`)
  - `index.html` (Add Recent Jobs section & update navigation)
  - `jobs.html` (New page for job listings)
  - All existing HTML pages (`services.html`, `category.html`, `professional.html`, `about.html`, `how-it-works.html`): Add navigation link to `jobs.html`
  - `css/components.css` or `css/jobs.css` (Styles for job cards, badges, and forms)
  - `tests/verify-jobs.js` (Automated verification test suite)

---

## 3. Requirement R1: Job Posting Backend API Specification

### 3.1 Endpoint Specifications

#### 3.1.1 `POST /api/jobs` — Create a New Job
- **Description:** Creates a new job posting.
- **Access Control:** Logged-in (`req.session.userId`), verified (`isVerified === true`), role `'customer'`.
- **Request Headers:**
  - `Content-Type: application/json`
  - `Cookie: connect.sid=...`
- **Request Body (JSON):**
  ```json
  {
    "title": "Fix leaking kitchen pipe",
    "description": "The pipe under the kitchen sink is dripping continuously. Need a plumber with replacement fittings.",
    "category": "cat-2",
    "location": "Downtown, Seattle",
    "budget": {
      "min": 100,
      "max": 200,
      "currency": "₹"
    },
    "urgency": "high",
    "photos": [
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a"
    ],
    "preferredDate": "2026-09-28T14:00:00Z"
  }
  ```
  *(Note: `budget` may also be provided as a string like `"100-200"` or number; backend must normalize).*
- **Backend Validation Rules:**
  - `title`: string, required, trimmed length 3–100 characters.
  - `description`: string, required, trimmed length 10–2000 characters.
  - `category`: string, required, must correspond to one of the 12 existing category IDs (`cat-1` to `cat-12`) or slugs (e.g. `plumber`). Normalized to canonical category ID and category name.
  - `location`: string, required, trimmed length 2–100 characters.
  - `budget`: required, min >= 0, max >= min if structured; if string, parsed into numeric range or formatted string.
  - `urgency`: required, enum: `'low'`, `'medium'`, `'high'`, `'urgent'`.
  - `photos`: optional array of strings (URLs/paths), defaults to `[]`.
  - `preferredDate`: optional/required date string (ISO 8601 or YYYY-MM-DDTHH:mm).
- **Processing Logic:**
  1. Verify session: If `!req.session || !req.session.userId`, return `401 Unauthorized`.
  2. Fetch user from DB: Read user by `req.session.userId`. If user does not exist, return `401 Unauthorized`.
  3. Verify status & role: If `!user.isVerified || user.role !== 'customer'`, return `403 Forbidden`.
  4. Validate all required fields: If invalid, return `400 Bad Request` with `{ success: false, error: 'Detailed validation message' }`.
  5. Assemble Job record with:
     - `id`: UUID (e.g. `crypto.randomUUID()`)
     - `title`, `description`, `category` (canonical ID), `categoryName`, `categorySlug`
     - `location`, `budget`, `urgency`, `photos`, `preferredDate`
     - `status`: `'open'`
     - `customerId`: `user.id`
     - `customerName`: `user.fullName`
     - `createdAt`: ISO timestamp
     - `updatedAt`: ISO timestamp
  6. Persist to `server/db/jobs.json`.
  7. Return `201 Created` or `200 OK`.
- **Response Format (Success):**
  ```json
  {
    "success": true,
    "job": {
      "id": "e93a0b12-9c95-4687-8df7-b0a79a83857d",
      "title": "Fix leaking kitchen pipe",
      "description": "The pipe under the kitchen sink is dripping continuously. Need a plumber with replacement fittings.",
      "category": "cat-2",
      "categoryName": "Plumber",
      "categorySlug": "plumber",
      "location": "Downtown, Seattle",
      "budget": { "min": 100, "max": 200, "currency": "₹" },
      "urgency": "high",
      "photos": ["https://images.unsplash.com/photo-1584622650111-993a426fbf0a"],
      "preferredDate": "2026-09-28T14:00:00Z",
      "status": "open",
      "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
      "customerName": "Montashir",
      "createdAt": "2026-09-25T18:40:00.000Z",
      "updatedAt": "2026-09-25T18:40:00.000Z"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request`: `{ "success": false, "error": "Title, description, category, and location are required." }`
  - `401 Unauthorized`: `{ "success": false, "error": "Unauthorized. Please log in." }`
  - `403 Forbidden`: `{ "success": false, "error": "Forbidden. Only verified customers can create jobs." }`
  - `500 Internal Server Error`: `{ "success": false, "error": "Server error while creating job." }`

---

#### 3.1.2 `GET /api/jobs` — Browse & Filter Open Jobs
- **Description:** Retrieves open job postings.
- **Access Control:** Public (no authentication required).
- **Query Parameters:**
  - `category` (optional, string): Filters by category ID (e.g. `cat-1`) or slug (e.g. `electrician`).
  - `urgency` (optional, string): Filters by urgency level (`low`, `medium`, `high`, `urgent`).
  - `location` (optional, string): Case-insensitive substring match on `location`.
  - `status` (optional, string): Defaults to `'open'` (or `'all'`).
  - `sort` (optional, string): `'newest'` (default, descending `createdAt`), `'oldest'` (ascending `createdAt`), `'budget-desc'` (highest budget), `'budget-asc'` (lowest budget).
  - `limit` (optional, integer): Limits number of records returned (e.g. `limit=6` for homepage preview).
- **Response Format (Success):**
  ```json
  {
    "success": true,
    "total": 1,
    "jobs": [
      {
        "id": "e93a0b12-9c95-4687-8df7-b0a79a83857d",
        "title": "Fix leaking kitchen pipe",
        "description": "The pipe under the kitchen sink is dripping continuously. Need a plumber with replacement fittings.",
        "category": "cat-2",
        "categoryName": "Plumber",
        "location": "Downtown, Seattle",
        "budget": { "min": 100, "max": 200, "currency": "₹" },
        "urgency": "high",
        "photos": ["https://images.unsplash.com/photo-1584622650111-993a426fbf0a"],
        "preferredDate": "2026-09-28T14:00:00Z",
        "status": "open",
        "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
        "customerName": "Montashir",
        "createdAt": "2026-09-25T18:40:00.000Z",
        "updatedAt": "2026-09-25T18:40:00.000Z"
      }
    ]
  }
  ```

---

#### 3.1.3 `GET /api/jobs/:id` — Retrieve Single Job Details
- **Description:** Retrieves complete details for a single job posting.
- **Access Control:** Public.
- **URL Parameter:** `id` (string/UUID).
- **Responses:**
  - `200 OK`: `{ "success": true, "job": { ... } }`
  - `404 Not Found`: `{ "success": false, "error": "Job not found." }`

---

#### 3.1.4 `PATCH /api/jobs/:id` — Update / Cancel Job
- **Description:** Allows the posting customer (or admin) to update job fields or change status to `'cancelled'`, `'in-progress'`, `'completed'`.
- **Access Control:** Logged-in session (`req.session.userId`), owner of job (`job.customerId === req.session.userId` or `user.role === 'admin'`).
- **Response Format (Success):**
  - `200 OK`: `{ "success": true, "job": { ...updatedJob } }`
- **Error Responses:**
  - `401 Unauthorized`: Not logged in.
  - `403 Forbidden`: Authenticated user is not the owner of the job.
  - `404 Not Found`: Job ID does not exist.

---

#### 3.1.5 `DELETE /api/jobs/:id` — Delete / Remove Job
- **Description:** Deletes or permanently cancels a job.
- **Access Control:** Logged-in owner or admin.
- **Responses:**
  - `200 OK`: `{ "success": true, "message": "Job deleted successfully." }`
  - `401 Unauthorized` / `403 Forbidden` / `404 Not Found`.

---

### 3.2 Data Layer & Persistence Architecture
- **Storage Target:** `server/db/jobs.json`.
- **File Initializer:** If `jobs.json` does not exist upon server start, initialize with `[]` or seed with realistic open jobs.
- **Database Functions (`server/db/database.js` or `server/db/jobsDatabase.js`):**
  - `readJobs()`: Reads and parses `jobs.json`.
  - `writeJobs(jobs)`: Formats with 2 spaces and writes to `jobs.json`.
  - `findJobById(id)`: Returns job matching ID.
  - `createJob(jobData)`: Appends job and saves.
  - `updateJob(id, updates)`: Updates matching job and saves.
  - `deleteJob(id)`: Removes matching job and saves.
- **Atomic Persistence:** Write operations must be synchronous (`fs.writeFileSync`) or use atomic rename to prevent file corruption during server restarts or sudden process termination.

---

## 4. Requirement R2: Job Posting Form UI Specification

### 4.1 Triggering & Entry Points
1. **Desktop Header:** `<button class="btn btn-primary">Post a Job</button>` inside `.header-actions`.
2. **Mobile Menu:** `<button class="btn btn-primary" style="width: 100%">Post a Job</button>` inside `.mobile-actions`.
3. **Availability:** Present on all 6 existing pages (`index.html`, `services.html`, `category.html`, `professional.html`, `about.html`, `how-it-works.html`) and the new `jobs.html`.

### 4.2 Auth-Gating Workflow
When any "Post a Job" button is clicked:
1. **Step 1: Check Current Session State:**
   - Query current user via `authService.getMe()`.
2. **Step 2: Unauthenticated User (`!user`):**
   - Prevent default click.
   - Show user-friendly toast: `showToast("Please log in to post a job.", "info")`.
   - Open existing login modal: `window.authUI.openModal('login-modal')`.
   - If mobile menu is open, close mobile menu before opening modal to prevent scrolling conflicts.
3. **Step 3: Authenticated but Unverified User (`user && !user.isVerified`):**
   - Show warning toast: `showToast("Please verify your email before posting a job.", "error")`.
   - Do NOT open job form.
4. **Step 4: Authenticated Non-Customer User (`user.role !== 'customer'`):**
   - If `user.role === 'professional'`, show notice: `showToast("Professional accounts cannot post jobs. Please switch to a customer account.", "error")`.
   - If `user.role === 'admin'`, allow creation for testing/admin purposes or display appropriate prompt.
5. **Step 5: Verified Customer (`user.isVerified && user.role === 'customer'`):**
   - Open `#job-post-modal` with smooth scale/fade animation.
   - Lock body scroll (`document.body.style.overflow = 'hidden'`).

### 4.3 Modal UI Structure & Fields
The Job Posting Modal will use `#job-post-modal` with the existing modal pattern:
```html
<div id="job-post-modal" class="modal-overlay hidden" data-job-modal>
  <div class="modal-container job-modal glass-panel">
    <div class="modal-header">
      <div class="flex items-center gap-2">
        <i data-lucide="plus-circle" class="text-blue"></i>
        <h3>Post a New Job</h3>
      </div>
      <button class="modal-close" id="job-modal-close" aria-label="Close modal">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div class="modal-body">
      <div id="job-form-error" class="auth-error-msg"></div>
      <form id="job-post-form">
        <!-- 1. Job Title -->
        <div class="input-group">
          <label class="input-label" for="job-title">Job Title *</label>
          <input type="text" id="job-title" class="input-field" placeholder="e.g. Fix leaking kitchen pipe" required minlength="5" maxlength="100">
        </div>

        <!-- 2. Category Selector -->
        <div class="input-group">
          <label class="input-label" for="job-category">Service Category *</label>
          <select id="job-category" class="input-field" required>
            <option value="" disabled selected>Select a category...</option>
            <!-- Dynamically populated from js/data/categories.js -->
          </select>
        </div>

        <!-- 3. Description -->
        <div class="input-group">
          <label class="input-label" for="job-description">Description *</label>
          <textarea id="job-description" class="input-field" rows="4" placeholder="Describe the job, specific issues, materials needed, or requirements..." required minlength="10" maxlength="2000"></textarea>
        </div>

        <!-- 4. Location -->
        <div class="input-group">
          <label class="input-label" for="job-location">Location / Area *</label>
          <div class="input-with-icon">
            <i data-lucide="map-pin" class="input-icon"></i>
            <input type="text" id="job-location" class="input-field" placeholder="e.g. Downtown, Seattle" required>
          </div>
        </div>

        <!-- 5. Budget Range -->
        <div class="input-row-2">
          <div class="input-group">
            <label class="input-label" for="job-budget-min">Min Budget (₹) *</label>
            <input type="number" id="job-budget-min" class="input-field" placeholder="500" min="0" required>
          </div>
          <div class="input-group">
            <label class="input-label" for="job-budget-max">Max Budget (₹) *</label>
            <input type="number" id="job-budget-max" class="input-field" placeholder="1500" min="0" required>
          </div>
        </div>

        <!-- 6. Urgency Level -->
        <div class="input-group">
          <label class="input-label">Urgency Level *</label>
          <div class="urgency-options">
            <label class="urgency-radio"><input type="radio" name="job-urgency" value="low"> <span>Low (Flexible)</span></label>
            <label class="urgency-radio"><input type="radio" name="job-urgency" value="medium" checked> <span>Medium (Few days)</span></label>
            <label class="urgency-radio"><input type="radio" name="job-urgency" value="high"> <span>High (Within 24h)</span></label>
            <label class="urgency-radio"><input type="radio" name="job-urgency" value="urgent"> <span>Urgent (Immediate)</span></label>
          </div>
        </div>

        <!-- 7. Preferred Date & Time -->
        <div class="input-group">
          <label class="input-label" for="job-preferred-date">Preferred Date & Time</label>
          <input type="datetime-local" id="job-preferred-date" class="input-field">
        </div>

        <!-- 8. Photos (URLs) -->
        <div class="input-group">
          <label class="input-label" for="job-photos">Photos (Optional URLs)</label>
          <input type="text" id="job-photos" class="input-field" placeholder="Paste image URL (comma-separated for multiple)">
        </div>

        <!-- Submit Button -->
        <button type="submit" class="btn btn-primary btn-lg" id="job-submit-btn" style="width: 100%; margin-top: var(--spacing-4);">
          <i data-lucide="send"></i> Post Job Now
        </button>
      </form>
    </div>
  </div>
</div>
```

### 4.4 Client-Side Validation & Lifecycle
- Pre-fill `job-location` using `localStorage.getItem('user-location')` if set and not "Set Location".
- Validate `budgetMin <= budgetMax`. If `budgetMin > budgetMax`, display error: "Max budget must be greater than or equal to min budget."
- Show loading state on submit button: `<i data-lucide="loader" class="animate-spin"></i> Posting...` and `disabled = true`.
- On API success:
  1. Close modal.
  2. Clear form fields.
  3. Restore body scroll: `document.body.style.overflow = ''`.
  4. Show success toast: `showToast("Job posted successfully!", "success")`.
  5. If on `jobs.html`, prepend/re-fetch jobs to show the new posting immediately.
  6. If on `index.html`, refresh the Recent Jobs section.

---

## 5. Requirement R3: Job Listing Page & Homepage Preview Specification

### 5.1 Dedicated Jobs Page (`jobs.html`)

#### 5.1.1 Page Architecture & Head Elements
- Include standard head tags: theme initializer script, favicon, meta viewport, font preconnects, Lucide script (`lucide.createIcons()`), and CSS links:
  - `css/reset.css`, `css/variables.css`, `css/global.css`, `css/transitions.css`, `css/components.css`, `css/auth.css`, `css/scroll-animations.css`, `css/header.css`, `css/footer.css`, `css/jobs.css`.
- Title: `Browse Open Jobs | BlueCollar Connect`.

#### 5.1.2 Header & Navigation
- Standard responsive header with:
  - Logo linking to `./index.html`.
  - Desktop nav links including: Home, Services, How It Works, Verified Pros, and **Jobs** (`<a href="./jobs.html" class="nav-link active">Jobs</a>`).
  - Mobile menu links including: Home, Services, How It Works, Verified Pros, and **Jobs**.
  - Actions: Location button, Theme dropdown toggle, Login/Logout button, "Post a Job" button.

#### 5.1.3 Page Content Sections
1. **Hero / Banner Section:**
   - Title: "Explore Open Job Postings" (with `data-char-reveal`).
   - Subtitle: "Connect directly with homeowners and clients in your area who need your expertise."
   - Search bar: Quick search input filtering jobs by title or location in real-time.
2. **Filter & Sort Control Bar:**
   - **Category Filter Dropdown:** "All Categories", plus each of the 12 categories (`cat-1` to `cat-12`).
   - **Urgency Filter Dropdown:** "All Urgencies", "Low", "Medium", "High", "Urgent".
   - **Sort Dropdown:** "Newest First" (default), "Budget: Low to High", "Budget: High to Low".
   - **Active Filters Counter:** e.g. "Showing 8 open jobs".
3. **Jobs Grid (`#jobs-grid`):**
   - Responsive multi-column layout (1 column mobile, 2 columns tablet, 3 columns desktop).
   - Glassmorphism / card styling conforming to `.card` and `var(--surface-secondary)`.
4. **Job Card Elements:**
   - **Header:**
     - Category badge: with Lucide icon and category name.
     - Urgency badge: with distinctive color coding:
       - `urgent`: Red/amber badge with pulse (`var(--accent-amber)` / `#ef4444`).
       - `high`: Orange badge (`#f97316`).
       - `medium`: Blue badge (`var(--accent-blue)`).
       - `low`: Muted gray badge (`var(--text-secondary)`).
     - Job Status: "Open" badge (`var(--accent-emerald)`).
   - **Body:**
     - Title: `<h3>` with bold typography.
     - Description: 2-3 lines truncated with ellipsis (`-webkit-line-clamp: 3`).
     - Metadata items:
       - Location: `<i data-lucide="map-pin"></i> [Location]`
       - Budget: `<i data-lucide="dollar-sign"></i> ₹[min] - ₹[max]`
       - Preferred Time: `<i data-lucide="clock"></i> [Date / Time or 'Flexible']`
       - Posted Time: `<i data-lucide="calendar"></i> Posted [time ago]`
   - **Footer:**
     - Client name / initials avatar.
     - "View Details" button opening `#job-details-modal`.
5. **Job Details Modal (`#job-details-modal`):**
   - Full description, expanded photos gallery (if photos exist), client details, location map badge, urgency explanation, and action button ("Contact Client" / "Apply for Job").
6. **Empty State (`#no-jobs-message`):**
   - Shown when filters return 0 results.
   - Message: "No open jobs found matching your criteria."
   - Button: "Reset Filters".

---

### 5.2 Homepage Preview Section (`index.html`)
- **Location on Homepage:** Positioned directly after "Featured Professionals" section and before "CTA Section".
- **Markup:**
  ```html
  <section class="section recent-jobs-section" style="background-color: var(--surface-primary);">
    <div class="container">
      <div class="section-header flex justify-between items-center mb-10">
        <div>
          <h2 class="section-title" data-char-reveal>Recent Job Postings</h2>
          <p class="text-secondary mt-1">Explore the latest requests from customers near you</p>
        </div>
        <a href="./jobs.html" class="btn btn-ghost">View All Jobs <i data-lucide="chevron-right" class="icon-sm"></i></a>
      </div>
      <div class="jobs-preview-grid" id="recent-jobs-grid">
        <!-- Dynamically rendered by js/pages/home.js -->
      </div>
    </div>
  </section>
  ```
- **Data Rendering in `js/pages/home.js`:**
  - `renderRecentJobs()` fetches `GET /api/jobs?limit=6`.
  - Dynamically builds 4 to 6 job cards matching the card style in `jobs.html`.
  - Re-initializes Lucide icons (`window.lucide.createIcons()`).
  - Registers new elements with `observeNewElements(grid)` for scroll animations (`data-animate="fade-up"`).

---

## 6. Requirement R4: Zero Regression on Existing Features

To ensure that the existing codebase continues to function without a single regression:

1. **Authentication Integrity:**
   - All existing auth endpoints (`/api/auth/register`, `/api/auth/login`, `/api/auth/send-otp`, `/api/auth/verify-otp`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/admin/users`) must remain 100% operational.
   - `authUI.js` and `authService.js` must have 0 line modifications (verified by `tests/verify-all-ac.js`).
2. **Page Navigation:**
   - All 6 existing HTML pages (`index.html`, `services.html`, `category.html`, `professional.html`, `about.html`, `how-it-works.html`) must load with HTTP 200 and render without JS errors.
   - Nav bar links across all pages must include the new `Jobs` link, while `initHeader()`'s active link detector continues to highlight the correct page.
3. **Search Bar:**
   - The hero search bar on `index.html` (`#service-search`) and its autocomplete dropdown (`#search-autocomplete`) must continue to search service categories and redirect to `category.html?cat=...`.
4. **Location Modal:**
   - The global location button (`.global-location-btn`) and modal (`#location-modal`) must continue to work via geolocation or manual entry, saving to `localStorage['user-location']`.
   - Mutual exclusion: Opening `#job-post-modal` must close `#location-modal` and vice versa.
5. **Theme Toggle:**
   - Dark/Light/System theme dropdown toggle must work seamlessly across all pages including `jobs.html`.
6. **Mobile Menu:**
   - Hamburger button (`.mobile-menu-btn`) toggles `.mobile-menu.open`, swaps Lucide `menu` / `x` icon, and locks body scrolling.
7. **File Preservation:**
   - No existing files shall be deleted or renamed.

---

## 7. Field-Level Specification for Jobs

The table below defines every attribute of a Job record across the frontend and backend:

| Field Name | Type | Storage Type | Required | Default | Validation & Constraints | Example Value | Description |
|---|---|---|---|---|---|---|---|
| `id` | UUIDv4 | String | Yes (Auto) | `crypto.randomUUID()` | Valid RFC4122 UUID v4 | `"3fa85f64-5717-4562-b3fc-2c963f66afa6"` | Unique identifier of the job |
| `title` | String | String | Yes | None | Trimmed string, min 3 chars, max 100 chars. XSS sanitized. | `"Install Ceiling Fan & Switchboard"` | Short summary of the job |
| `description` | String | String | Yes | None | Trimmed string, min 10 chars, max 2000 chars. XSS sanitized. | `"Need an experienced electrician to install two ceiling fans and replace a 6-modular switchboard in the living room."` | Detailed description of tasks, materials, requirements |
| `category` | String | String | Yes | None | Must match one of 12 categories: `cat-1` to `cat-12` (or valid slug). Normalized to canonical `cat-X`. | `"cat-1"` | Identifier of the service category |
| `categoryName` | String | String | Yes (Derived) | Category lookup | Looked up from `categories.js` based on `category`. | `"Electrician"` | Human-readable category display name |
| `categorySlug` | String | String | Yes (Derived) | Category lookup | Looked up from `categories.js` based on `category`. | `"electrician"` | Category URL slug |
| `location` | String | String | Yes | None | Trimmed string, min 2 chars, max 100 chars. | `"Indiranagar, Bangalore"` | Geographic area or neighborhood of the job |
| `budget` | Object / Range | Object / Number | Yes | None | `{ min: number >= 0, max: number >= min, currency: string }`. If submitted as string (e.g. `"500-1000"`), parsed into `{ min: 500, max: 1000, currency: "₹" }`. | `{"min": 800, "max": 1500, "currency": "₹"}` | Expected price or compensation range |
| `urgency` | String (Enum) | String | Yes | `'medium'` | One of: `'low'`, `'medium'`, `'high'`, `'urgent'` | `"high"` | Urgency level indicating required response timeframe |
| `photos` | Array<String> | Array | No | `[]` | Array of URLs or relative file paths. Max 5 items. URLs must use `http`, `https`, or `/`. | `["https://images.unsplash.com/photo-1584622650111-993a426fbf0a"]` | Photo URLs showing issue or workspace |
| `preferredDate` | String | ISO String / Datetime | No | `null` | ISO 8601 string or valid datetime format. | `"2026-09-30T10:00:00Z"` | Customer's preferred service date and time |
| `status` | String (Enum) | String | Yes (Auto) | `'open'` | One of: `'open'`, `'in-progress'`, `'completed'`, `'cancelled'` | `"open"` | Current workflow status of the job |
| `customerId` | String (UUID) | String | Yes (Auto) | `req.session.userId` | Must correspond to valid user in `users.json`. | `"7c536f7f-fe87-4b40-b638-765c6bf25341"` | User ID of the customer who posted the job |
| `customerName` | String | String | Yes (Auto) | `user.fullName` | Full name of posting user from session/DB. | `"Montashir"` | Customer display name |
| `createdAt` | String | ISO Timestamp | Yes (Auto) | `new Date().toISOString()` | Valid ISO 8601 timestamp string | `"2026-09-25T18:40:00.000Z"` | Timestamp when job was created |
| `updatedAt` | String | ISO Timestamp | Yes (Auto) | `new Date().toISOString()` | Valid ISO 8601 timestamp string | `"2026-09-25T18:40:00.000Z"` | Timestamp when job was last modified |

---

## 8. Authentication and Permission Gating Rules

### 8.1 Matrix of Auth & Permission Rules

| Route / Action | Method | Required Auth | Required Verification | Allowed Role(s) | Status on Auth Failure | Error Body Format |
|---|---|---|---|---|---|---|
| `POST /api/jobs` | POST | Logged in session (`req.session.userId`) | `isVerified === true` | `'customer'` only | `401 Unauthorized` (no session) / `403 Forbidden` (unverified or role != customer) | `{"success": false, "error": "Unauthorized. Please log in."}` / `{"success": false, "error": "Forbidden. Only verified customers can create jobs."}` |
| `GET /api/jobs` | GET | None (Public) | None | Any | N/A (Always succeeds) | `{"success": true, "jobs": [...]}` |
| `GET /api/jobs/:id` | GET | None (Public) | None | Any | N/A (Always succeeds or 404) | `{"success": false, "error": "Job not found."}` |
| `PATCH /api/jobs/:id` | PATCH | Logged in session | `isVerified === true` | Owner (`job.customerId === req.session.userId`) or Admin | `401 Unauthorized` / `403 Forbidden` | `{"success": false, "error": "You do not have permission to modify this job."}` |
| `DELETE /api/jobs/:id` | DELETE | Logged in session | `isVerified === true` | Owner (`job.customerId === req.session.userId`) or Admin | `401 Unauthorized` / `403 Forbidden` | `{"success": false, "error": "You do not have permission to delete this job."}` |

### 8.2 Frontend Auth Gating Rules
- **Desktop/Mobile "Post a Job" Button Click:**
  - Case 1: Session not active (`authService.getMe()` returns `401` or `success: false`):
    - Display toast: `showToast("Please log in to post a job.", "info")`.
    - Open login modal: `window.authUI.openModal('login-modal')`.
  - Case 2: Session active, but `user.isVerified === false`:
    - Display toast: `showToast("Please verify your email before posting a job.", "error")`.
    - Do NOT open form.
  - Case 3: Session active, but `user.role !== 'customer'`:
    - Display toast: `showToast("Only customer accounts can post jobs.", "error")`.
    - Do NOT open form.
  - Case 4: Session active, `user.isVerified === true`, `user.role === 'customer'`:
    - Open `#job-post-modal`.

---

## 9. Test Suite Specifications & Verification Requirements

### 9.1 Verification Test Harness: `tests/verify-jobs.js`
A self-contained, standalone Node.js test script `tests/verify-jobs.js` must be implemented.

#### Execution Command
```bash
node tests/verify-jobs.js
```

#### Core Capabilities & Architecture
1. **Server Lifecycle Handling:**
   - Detect if server is already running on `http://localhost:3000`.
   - If not running, spawn an ephemeral server using `child_process.spawn('node', ['server.js'])` or create an in-process Express instance, wait for port readiness, and cleanly terminate on process exit.
2. **Database Isolation & Rollback:**
   - Backup `server/db/jobs.json` and `server/db/users.json` before running test cases.
   - Clean up test records and restore pristine files in `process.on('exit')` or `finally` block.
3. **HTTP Client Protocol:**
   - Native Node.js `fetch` with cookie jar management to persist session cookies (`connect.sid`) across requests.

#### Test Cases Covered by `tests/verify-jobs.js`
- **AC-1: Unauthenticated Job Creation (401 Check)**
  - Send `POST /api/jobs` without session cookie.
  - Assert response status is `401`.
  - Assert response body is `{ success: false, error: ... }`.
- **AC-2: Unverified User Job Creation (403 Check)**
  - Authenticate as an unverified user.
  - Send `POST /api/jobs`.
  - Assert response status is `403`.
- **AC-3: Non-Customer Role Job Creation (403 Check)**
  - Authenticate as a verified professional or admin.
  - Send `POST /api/jobs`.
  - Assert response status is `403`.
- **AC-4: Verified Customer Job Creation (Success Check)**
  - Authenticate as a verified customer (`muntasirahmed1212@gmail.com` or created test customer).
  - Send valid `POST /api/jobs` payload.
  - Assert response status is `200` or `201`.
  - Assert `res.body.success === true`.
  - Assert all returned fields (`id`, `title`, `description`, `category`, `budget`, `urgency`, `status: "open"`, `customerId`, `createdAt`) are correctly populated.
- **AC-5: Input Validation Checks (400 Bad Request)**
  - Send empty title, missing description, invalid category (e.g. `cat-999`), or invalid urgency (e.g. `super-fast`).
  - Assert response status is `400`.
- **AC-6: Public Job Listing & Category Filtering (200 Check)**
  - Send unauthenticated `GET /api/jobs`.
  - Assert status is `200` and response contains the created job.
  - Send `GET /api/jobs?category=cat-1` (or relevant category).
  - Assert only jobs with that category are returned.
- **AC-7: Single Job Details Retrieval (200 & 404 Check)**
  - Send `GET /api/jobs/:id` with valid ID -> assert `200` and correct job object.
  - Send `GET /api/jobs/invalid-id` -> assert `404`.
- **AC-8: Job Owner Update & Cancellation (200 Check)**
  - Authenticated customer sends `PATCH /api/jobs/:id` with `{ status: "cancelled" }`.
  - Assert status is `200` and job status is updated to `"cancelled"`.
- **AC-9: Persistence Across Server Restarts**
  - Verify `server/db/jobs.json` contains the serialized record on disk.
- **AC-10: Regression Verification of Existing Auth Endpoints**
  - Verify `/api/auth/me` returns 401 unauthenticated.
  - Verify `/api/auth/login` and `/api/auth/logout` function normally.
  - Verify `authUI.js` and `authService.js` remain completely unmodified (`git status --porcelain`).

---

## 10. Features Discovered

The following features have been discovered during exploration of the codebase, existing routes, data models, and specification requirements:

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Backend API | Job Creation Endpoint | Creates a new job posting for verified customers | `POST /api/jobs`, JSON body with title, description, category, location, budget, urgency, photos, preferredDate; Session cookie | `201`/`200` with `{ success: true, job: {...} }` | `401` if no session; `403` if not verified customer; `400` if validation fails | `ORIGINAL_REQUEST.md` R1 |
| 2 | Backend API | Job Listing & Filter Endpoint | Lists open jobs with category, urgency, location, sorting, limit | `GET /api/jobs?category=&urgency=&location=&sort=&limit=` | `200` with `{ success: true, jobs: [...] }` | `200` with empty array if no match; `500` on server error | `ORIGINAL_REQUEST.md` R1, R3 |
| 3 | Backend API | Single Job Details Endpoint | Fetches complete details of a specific job by ID | `GET /api/jobs/:id` | `200` with `{ success: true, job: {...} }` | `404` with `{ success: false, error: "Job not found" }` if invalid ID | `ORIGINAL_REQUEST.md` R1 |
| 4 | Backend API | Job Modification Endpoint | Allows job owner or admin to update details or status | `PATCH /api/jobs/:id`, JSON body with updates; Session cookie | `200` with `{ success: true, job: {...} }` | `401` if unauth; `403` if not owner; `404` if not found | `ORIGINAL_REQUEST.md` R1 |
| 5 | Backend API | Job Deletion Endpoint | Allows job owner or admin to cancel/delete a job | `DELETE /api/jobs/:id`; Session cookie | `200` with `{ success: true, message: ... }` | `401` if unauth; `403` if not owner; `404` if not found | `ORIGINAL_REQUEST.md` R1 |
| 6 | Data Layer | File Persistence (`jobs.json`) | Persistent storage of job records across restarts | File path `server/db/jobs.json`, JSON array of job objects | Serialized JSON file | Creates `[]` if not present | `ORIGINAL_REQUEST.md` R1 & `server/db/database.js` |
| 7 | Frontend UI | Desktop "Post a Job" Button Binding | Desktop header button opens job modal or login prompt | Click event on `.header-actions .btn-primary` ("Post a Job") | Opens `#job-post-modal` or `#login-modal` | Shows toast if unverified/non-customer | `index.html:87`, `js/components/modal.js:9-19` |
| 8 | Frontend UI | Mobile "Post a Job" Button Binding | Mobile menu button opens job modal or login prompt | Click event on `.mobile-actions .btn-primary` ("Post a Job") | Closes mobile menu & opens `#job-post-modal` or `#login-modal` | Shows toast if unverified/non-customer | `index.html:125`, `tests/e2e-login-modal.js:1048` |
| 9 | Frontend UI | Category Selector Auto-population | Dropdown populated with 12 existing categories | `categories` array from `js/data/categories.js` (`cat-1` to `cat-12`) | `<option>` elements with category name and ID/slug | Fallback if categories array fails | `js/data/categories.js` |
| 10 | Frontend UI | Location Auto-fill from localStorage | Pre-fills job form location with user's saved location | `localStorage.getItem('user-location')` | Sets `#job-location` input value | Left blank if location is "Set Location" | `js/components/location.js:14-15` |
| 11 | Frontend UI | Job Form Validation | Client-side check for mandatory fields and budget range | Form submit event, input values | Enables/disables submit, highlights errors | Displays `.auth-error-msg` if invalid | `css/components.css:158-164` |
| 12 | Frontend UI | Dedicated Job Listing Page (`jobs.html`) | Full browse page with search, category/urgency filters, cards | Navigation to `jobs.html` | Card grid with all open jobs | Displays `#no-jobs-message` if 0 jobs | `ORIGINAL_REQUEST.md` R3 |
| 13 | Frontend UI | Homepage Preview Section | Displays latest 4-6 open jobs on homepage | `initHome()` in `js/pages/home.js`, `GET /api/jobs?limit=6` | Grid of job cards in `#recent-jobs-grid` on `index.html` | Graceful empty state if no open jobs | `ORIGINAL_REQUEST.md` R3, `js/pages/home.js` |
| 14 | Frontend UI | Job Details Modal | Modal showing expanded job info, photos, and contact | Click on "View Details" on any job card | Opens `#job-details-modal` with complete details | Closes on X or backdrop click | `css/components.css:171-250` |
| 15 | Navigation | Global Navigation Jobs Link | Adds "Jobs" link to desktop and mobile navigation | Header nav markup `<a href="./jobs.html" class="nav-link">Jobs</a>` | Highlights active page via `initHeader()` | None | `js/components/header.js:52-70` |
| 16 | App Routing | Dynamic Module Import for `jobs.html` | Router in `js/app.js` dynamically loads `js/pages/jobs.js` | `window.location.pathname.includes('jobs.html')` | Calls `initJobs()` | None | `js/app.js:25-39` |
| 17 | Test Suite | Automated Jobs Verification Script | Single command verification of jobs CRUD, auth gating, regressions | `node tests/verify-jobs.js` | Console report with pass/fail metrics | Exits with non-zero code on failure | `ORIGINAL_REQUEST.md` AC |

---

## 11. Edge Cases & Boundary Conditions

| # | Feature | Input / Condition | Observed / Required Behavior |
|---|---------|-------------------|-----------------------------|
| 1 | Job Creation | User session missing (`req.session.userId` is undefined) | Backend returns `401 Unauthorized` with `{ success: false, error: 'Unauthorized. Please log in.' }`. Frontend triggers `window.authUI.openModal('login-modal')`. |
| 2 | Job Creation | User authenticated but `isVerified === false` | Backend returns `403 Forbidden` with `{ success: false, error: 'Forbidden. Only verified customers can create jobs.' }`. Frontend displays error toast. |
| 3 | Job Creation | User authenticated with role `'admin'` or `'professional'` | Backend returns `403 Forbidden` (`user.role !== 'customer'`). Frontend displays clear notice that only customer accounts can post jobs. |
| 4 | Job Creation | `budgetMin` is greater than `budgetMax` (e.g. min: 1000, max: 500) | Frontend prevents submission with validation error; backend returns `400 Bad Request` ("Minimum budget cannot exceed maximum budget"). |
| 5 | Job Creation | Budget input contains negative numbers (e.g. `-100`) | Frontend HTML `min="0"` restricts input; backend rejects with `400 Bad Request`. |
| 6 | Job Creation | Category ID provided does not exist in the 12 categories (e.g. `cat-999`) | Backend rejects with `400 Bad Request` ("Invalid category specified"). |
| 7 | Job Creation | Category provided as slug (`"electrician"`) instead of ID (`"cat-1"`) | Backend resolves slug to canonical ID and stores both `category: "cat-1"` and `categoryName: "Electrician"`. |
| 8 | Job Creation | Photos input is empty or contains non-URL strings | Backend gracefully defaults `photos` to `[]`. If URLs are provided, verifies they start with `http://`, `https://`, or `/`. |
| 9 | Job Creation | Title or description contains HTML tags (`<script>`, `<b>`, etc.) | Frontend safely renders via `textContent` (preventing XSS); backend strips/sanitizes unsafe HTML. |
| 10 | Job Creation | Title or description exceeds max length (e.g. title > 100 chars, desc > 2000 chars) | Backend rejects with `400 Bad Request` specifying character limits. |
| 11 | Job Listing | Zero jobs match the selected filter combination (e.g. category + urgency) | UI displays `#no-jobs-message` container with "No open jobs found" message and "Reset Filters" button, avoiding broken grid or layout shifts. |
| 12 | Job Listing | Search input contains special regex characters (`(`, `[`, `*`, `?`) | Search filter logic uses `String.prototype.includes` instead of unescaped `RegExp` to prevent `SyntaxError`. |
| 13 | Job Listing | Category filter passed via URL query parameter (e.g. `jobs.html?category=cat-2`) | `initJobs()` reads `getQueryParams()`, selects the corresponding category in dropdown, and immediately applies filter on initial render. |
| 14 | Job Update | Non-owner user attempts `PATCH /api/jobs/:id` | Backend checks `job.customerId !== req.session.userId`; returns `403 Forbidden`. |
| 15 | UI Interaction | "Post a Job" clicked while Location Modal is open | Location modal is closed immediately before opening Job Posting Modal to enforce mutual exclusion. |
| 16 | UI Interaction | "Post a Job" clicked from within Mobile Menu | Mobile menu is toggled closed, body scroll lock is transferred to the modal overlay. |
| 17 | UI Interaction | User presses `Escape` key while `#job-post-modal` is visible | Modal closes and `document.body.style.overflow` is restored to `''`. |
| 18 | UI Interaction | User clicks outside modal container on the backdrop overlay | Modal closes safely and restores body scrolling. |
| 19 | Test Suite | Server is not currently running when `node tests/verify-jobs.js` is run | Test script automatically spins up Express server on dynamic port or child process, runs all tests, and shuts it down upon completion. |
| 20 | Test Suite | Existing test `tests/e2e-login-modal.js` expects "coming soon" toast on unauth click | When unauthenticated click triggers login prompt, any legacy expectation in `e2e-login-modal.js` must be accounted for or accompanied by an informational toast so existing expectations are not broken. |

---

## 12. Verification & Acceptance Checklist

### 12.1 Backend API Criteria
- [ ] `POST /api/jobs` creates job and returns `{ success: true, job: {...} }` for verified customer.
- [ ] `POST /api/jobs` returns `401 Unauthorized` without valid session.
- [ ] `POST /api/jobs` returns `403 Forbidden` for unverified user or non-customer role.
- [ ] `POST /api/jobs` returns `400 Bad Request` on missing/invalid fields.
- [ ] `GET /api/jobs` returns list of open jobs without authentication.
- [ ] `GET /api/jobs?category=<catId>` filters jobs correctly.
- [ ] `GET /api/jobs?urgency=<level>` filters jobs by urgency.
- [ ] `GET /api/jobs/:id` returns single job details (`200`) or `404`.
- [ ] `PATCH /api/jobs/:id` allows owner to update status/details.
- [ ] `DELETE /api/jobs/:id` allows owner to delete/cancel job.
- [ ] Job records persist across server restarts in `server/db/jobs.json`.

### 12.2 Frontend UI Criteria
- [ ] Desktop & Mobile "Post a Job" buttons open `#job-post-modal` when logged in as verified customer.
- [ ] Desktop & Mobile "Post a Job" buttons show login prompt / modal when not logged in.
- [ ] Job posting form collects: title, description, category (from 12 categories), location, budget range, urgency, preferred date/time, photos.
- [ ] Client validation prevents submission of empty required fields and invalid budget ranges.
- [ ] Successful submission closes modal, displays toast, and refreshes listing.
- [ ] `jobs.html` displays all open jobs in responsive card grid matching design system.
- [ ] `jobs.html` provides working category, urgency, and sorting controls.
- [ ] `index.html` displays Recent Jobs section with 4-6 latest open jobs.
- [ ] Navigation headers across all pages include active link to `jobs.html`.

### 12.3 Regression & Forbidden File Criteria
- [ ] `node server.js` starts without errors.
- [ ] All 6 existing pages (`index.html`, `services.html`, `category.html`, `professional.html`, `about.html`, `how-it-works.html`) load cleanly.
- [ ] Registration, OTP verification, login, logout, and getMe flows operate without issue.
- [ ] Location modal, theme toggle, and hero search bar remain fully functional.
- [ ] `js/components/authUI.js` and `js/services/authService.js` remain completely untouched (`git diff` shows 0 changes).
- [ ] Automated test suite `node tests/verify-jobs.js` executes and passes cleanly.
