# Frontend Architecture Survey: Post Jobs Feature
**Agent**: `explorer_survey_2`  
**Date**: 2026-09-25  
**Workspace**: `c:\Users\munta\Downloads\blue_collar`  
**Target Feature**: BlueCollar Connect "Post Jobs" Full-Stack Feature (Frontend Focus)

---

## Executive Summary
This survey provides a comprehensive technical blueprint of the frontend architecture of BlueCollar Connect to guide the implementation of the "Post Jobs" feature (R1-R4). The platform is a modern vanilla JavaScript ES module Single/Multi-Page application running on Express 5. It uses Lucide icons, a modular CSS token system (dark/light theme via `[data-theme]`), requestAnimationFrame-based glassmorphism modals, and session-based authentication.

Currently, every page contains "Post a Job" buttons in both desktop and mobile headers (`<button class="btn btn-primary">Post a Job</button>`), which are intercepted by `js/components/modal.js` to display an informational toast ("Post a Job feature coming soon!").

This survey details:
1. Exact button locations across all 6 existing HTML pages.
2. Architecture of `js/app.js`, dynamic routing, components, and services.
3. The modal lifecycle, backdrop, animations, and mutual exclusion mechanism.
4. How client-side auth state can be safely queried without modifying `authUI.js` or `authService.js`.
5. The 12 category data objects and schema in `js/data/categories.js`.
6. The CSS design system, typography scale, responsive breakpoints, and glassmorphism styling.
7. Structural and component requirements for the new `jobs.html` page and the "Recent Jobs" homepage preview section on `index.html`.

---

## 1. HTML Pages & "Post a Job" Button Locations

There are 6 existing HTML pages in the workspace root. Every page has hardcoded HTML headers containing two "Post a Job" buttons: one in the desktop `.header-actions` bar, and one in the mobile `.mobile-actions` drawer.

### Button Audit Table

| File | Desktop Button Line | Mobile Button Line | Surrounding Container |
|---|---|---|---|
| `index.html` | Line 87 | Line 125 | `.header-actions` / `.mobile-actions` |
| `services.html` | Line 85 | Line 123 | `.header-actions` / `.mobile-actions` |
| `category.html` | Line 85 | Line 123 | `.header-actions` / `.mobile-actions` |
| `professional.html` | Line 84 | Line 122 | `.header-actions` / `.mobile-actions` |
| `about.html` | Line 86 | Line 123 | `.header-actions` / `.mobile-actions` |
| `how-it-works.html` | Line 86 | Line 123 | `.header-actions` / `.mobile-actions` |

### Desktop Header Markup Structure (Example from `index.html:84-88`)
```html
<div class="header-actions">
  <button class="btn btn-ghost global-location-btn" title="Set Location" ...>...</button>
  <div class="theme-dropdown-container">...</div>
  <button class="btn btn-ghost">Login</button>
  <button class="btn btn-primary">Post a Job</button>
</div>
```

### Mobile Drawer Markup Structure (Example from `index.html:122-126`)
```html
<div class="mobile-actions">
  <button class="btn btn-outline global-location-btn" ...>...</button>
  <div class="theme-dropdown-container" ...>...</div>
  <button class="btn btn-outline" style="width: 100%">Login</button>
  <button class="btn btn-primary" style="width: 100%">Post a Job</button>
</div>
```

### Navigation Links in Headers
Both desktop (`nav.nav-desktop .nav-links`) and mobile (`nav.mobile-nav-links`) currently have:
```html
<a href="./index.html" class="nav-link">Home</a>
<a href="./services.html" class="nav-link">Services</a>
<a href="/how-it-works.html" class="nav-link">How It Works</a>
<a href="./services.html?verified=true" class="nav-link">Verified Pros</a>
```
**Requirement Integration**: Acceptance criteria R3 mandates: *"Navigation header includes a link to the jobs page"*.  
A new link `<a href="./jobs.html" class="nav-link">Jobs</a>` (or `Browse Jobs`) should be added to both `.nav-links` and `.mobile-nav-links` across the site.

---

## 2. Frontend JavaScript Architecture

The application uses standard ES Modules (`<script type="module" src="./js/app.js"></script>`) without a bundler. All script files reside under `js/`.

```
js/
├── app.js                   # Application root orchestrator
├── components/
│   ├── authModals.js        # HTML template generator for 5 auth modals
│   ├── authUI.js            # [FORBIDDEN TO MODIFY] Auth state, modal listeners, headers
│   ├── footer.js            # Injects dynamic footer markup and handles newsletter/links
│   ├── header.js            # Header scroll effects, mobile menu toggle, active route highlighting
│   ├── location.js          # Geolocation & manual location modal management
│   ├── modal.js             # Generic modal handlers (currently post-a-job coming soon toast)
│   └── searchBar.js         # Global search input query redirector
├── data/
│   ├── categories.js        # 12 service category definitions & getCategoryBySlug()
│   └── professionals.js     # Hardcoded mock professionals data
├── pages/
│   ├── category.js          # Category page logic: dynamic title, pros list, filters
│   ├── home.js              # Home page logic: category grid & featured pros grid
│   ├── professional.js      # Professional profile page logic & booking modal
│   └── services.js          # All services page logic & category search filter
├── services/
│   └── authService.js       # [FORBIDDEN TO MODIFY] Fetch wrapper for /api/auth/* endpoints
└── utils/
    ├── animations.js        # Native IntersectionObserver scroll animations & char reveal
    ├── helpers.js           # Query param parser (getQueryParams) & showToast utility
    └── theme.js             # Dark / light / system theme state manager
```

### Orchestrator Lifecycle (`js/app.js`)
On `DOMContentLoaded`:
1. `initPageTransitions()` — Sets up smooth exit transitions for internal links.
2. `initThemeToggle()` — Reads `localStorage.getItem('theme')` and initializes theme switcher.
3. `initAuth()` — Injects auth modals to DOM, hooks form listeners, and calls `checkAuthStatus()`.
4. `initHeader()` — Sets sticky scroll observer, mobile drawer toggle, and highlights active `.nav-link`.
5. `initLocation()` — Binds global location buttons and initializes location modal.
6. `renderFooter()` — Injects footer markup into `<footer>`.
7. `initGlobalSearch()` — Binds search inputs to `./services.html?search=...`.
8. `initModals()` — Binds `.btn-primary` with text "Post a Job".
9. `initScrollAnimations()` — Configures `IntersectionObserver` for `[data-animate]` and `[data-char-reveal]`.
10. **Path-Based Dynamic Import**:
    ```js
    const path = window.location.pathname;
    if (path === '/' || path.endsWith('index.html')) {
      import('./pages/home.js').then(module => {
        module.initHome();
        if (window.lucide) window.lucide.createIcons();
      });
    } else if (path.includes('services.html')) {
      import('./pages/services.js').then(module => module.initServices());
    } else if (path.includes('category.html')) {
      import('./pages/category.js').then(module => module.initCategory());
    } else if (path.includes('professional.html')) {
      import('./pages/professional.js').then(module => module.initProfessional());
    }
    ```
    **Extensibility**: Adding `jobs.html` is a drop-in match:
    ```js
    } else if (path.includes('jobs.html')) {
      import('./pages/jobs.js').then(module => module.initJobs());
    }
    ```

---

## 3. Modal Architecture, Glass-Panel Styling & Lifecycle

### DOM Structure Conventions
Existing modals in the system (`authModals.js`, `location.js`, `professional.html`) follow this standardized DOM layout:

```html
<div id="[modal-id]" class="modal-overlay hidden" data-modal>
  <div class="modal-container glass-panel [custom-class]">
    <div class="modal-header">
      <h3>Modal Title</h3>
      <button class="modal-close" aria-label="Close modal"><i data-lucide="x"></i></button>
    </div>
    <div class="modal-body">
      <!-- Form or content -->
    </div>
    <div class="modal-footer"> <!-- Optional -->
      <button class="btn btn-ghost modal-close-btn">Cancel</button>
      <button class="btn btn-primary" id="[action-btn-id]">Confirm</button>
    </div>
  </div>
</div>
```

### CSS Rules (`css/components.css` & `css/global.css`)
- **Overlay Backdrop**:
  - `position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); z-index: 1000;`
  - `.modal-overlay.hidden`: `display: none;`
  - `.modal-overlay`: `opacity: 0; transition: opacity var(--transition-normal);`
  - `.modal-overlay.visible`: `opacity: 1;`
- **Modal Container Animation**:
  - Closed: `transform: translateY(20px) scale(0.95); transition: transform var(--transition-normal);`
  - Open: `.modal-overlay.visible .modal-container { transform: translateY(0) scale(1); }`
- **Glass-Panel Utility (`css/global.css:162-167`)**:
  ```css
  .glass-panel {
    background: var(--surface-glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border-subtle);
  }
  ```
  Where `var(--surface-glass)` is `rgba(26, 45, 74, 0.6)` in dark mode and `rgba(255, 255, 255, 0.7)` in light mode.

### Modal Lifecycle & Interactivity Protocol
From `authUI.js` and `location.js`, the modal opening protocol follows these strict rules:
1. **Double-RAF / Class Toggle**:
   ```javascript
   modal.classList.remove('hidden');
   requestAnimationFrame(() => {
     modal.classList.add('visible');
   });
   ```
2. **Scroll Lock**:
   `document.body.style.overflow = 'hidden';` upon opening.  
   Upon closing, restore `document.body.style.overflow = '';` only if no other modal or mobile drawer is open.
3. **Mutual Exclusion**:
   Before opening a modal, close all others:
   ```javascript
   if (window.authUI?.closeAllAuthModals) window.authUI.closeAllAuthModals();
   if (window.locationUI?.closeModal) window.locationUI.closeModal();
   ```
   A new `jobModal` must expose `closeJobModal()` and participate in mutual exclusion.
4. **Dismissal Triggers**:
   - Click on `.modal-close` or `.modal-close-btn`.
   - Click on `.modal-overlay` outside `.modal-container` (`if (e.target === modal) close();`).
   - `Escape` key handler (`if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();`).
5. **Lucide Icon Re-initialization**:
   Any dynamically added or manipulated markup containing `<i data-lucide="...">` must call:
   ```javascript
   if (window.lucide) window.lucide.createIcons();
   ```

---

## 4. Client-Side Auth State Observation (Without Modifying Forbidden Files)

### Strict Constraint Reminder
- `js/components/authUI.js` is **FORBIDDEN TO MODIFY**.
- `js/services/authService.js` is **FORBIDDEN TO MODIFY**.

### Investigation of Existing Auth Interfaces
Examining `js/services/authService.js`:
```javascript
export const authService = {
  ...
  async getMe() {
    return fetchWithJSON('/me', { method: 'GET' });
  },
  ...
};
```
And examining `server/controllers/authController.js:232-242`:
```javascript
exports.getMe = (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  const users = db.readUsers();
  const user = users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ success: false, error: 'User not found' });

  res.json({ success: true, user: { fullName: user.fullName, email: user.email, role: user.role } });
};
```

And examining `server/controllers/authController.js:168-179`:
- A session `req.session.userId` is **only** created after successful email OTP verification (`db.updateUser(..., { isVerified: true })`).
- If an unverified user attempts to login, the server returns status `403` with `{ needsVerification: true }`.
- Therefore: Any user with a valid session (`res.success === true` from `authService.getMe()`) is **guaranteed to be verified**.
- The `res.user.role` field indicates their role (e.g. `'customer'`, `'admin'`).

Examining `js/components/authUI.js:11-13`:
```javascript
export function initAuth() {
  window.authUI = { openModal, closeAllAuthModals };
  ...
}
```
`window.authUI.openModal('login-modal')` is exposed globally on `window`.

### Clean Architectural Solution for Job Posting Auth Gating
Any new component (such as `js/components/jobModal.js` or `js/pages/jobs.js`) can cleanly check authentication and authorization:

```javascript
import { authService } from '../services/authService.js';
import { showToast } from '../utils/helpers.js';

export async function checkCustomerAuth() {
  try {
    const res = await authService.getMe();
    if (!res || !res.success || !res.user) {
      return { authenticated: false, isCustomer: false, user: null };
    }
    const isCustomer = res.user.role === 'customer';
    return { authenticated: true, isCustomer, user: res.user };
  } catch (err) {
    return { authenticated: false, isCustomer: false, user: null };
  }
}
```

### Flow when user clicks "Post a Job":
1. User clicks "Post a Job" (desktop or mobile header, or page CTA).
2. Call `const auth = await checkCustomerAuth();`
3. **If not authenticated (`!auth.authenticated`)**:
   - Call `showToast("Please log in to post a job", "info");`
   - Trigger the login modal: `window.authUI.openModal('login-modal');`
4. **If authenticated but not a customer (`!auth.isCustomer`)**:
   - Call `showToast("Only customer accounts can post jobs", "error");`
5. **If authenticated customer (`auth.authenticated && auth.isCustomer`)**:
   - Open the Job Posting Form modal (`openJobModal()`).

This mechanism:
- Requires **zero changes** to `authUI.js` and `authService.js`.
- Always validates against the live server session (prevents stale client state).
- Seamlessly integrates with the existing login modal and toasts.

---

## 5. Category Data Structure (`js/data/categories.js`)

There are exactly 12 categories exported as an array `categories` in `js/data/categories.js`.

### Full Category Specification

| Category ID | Name | Slug | Lucide Icon | Popular Services Samples |
|---|---|---|---|---|
| `cat-1` | Electrician | `electrician` | `zap` | Fan Installation, Switchboard Repair, Inverter Setup, Wiring |
| `cat-2` | Plumber | `plumber` | `wrench` | Tap Repair, Washbasin Blockage, Toilet Repair, Water Tank Cleaning |
| `cat-3` | Carpenter | `carpenter` | `hammer` | Door Lock Change, Bed Repair, Custom Wardrobe, Drill & Hang |
| `cat-4` | Painter | `painter` | `paint-bucket` | Full Home Painting, Accent Wall, Waterproofing, Wood Polish |
| `cat-5` | Constructor | `constructor` | `hard-hat` | Floor Tiling, Wall Plastering, Bathroom Renovation, Brickwork |
| `cat-6` | AC Repair | `ac-repair` | `snowflake` | AC Deep Clean, Gas Refill, AC Installation, PCB Repair |
| `cat-7` | Cleaning | `cleaning` | `sparkles` | Full Home Deep Clean, Sofa Spa, Bathroom Cleaning, Kitchen Cleaning |
| `cat-8` | Pest Control | `pest-control` | `shield` | Cockroach Control, Termite Treatment, Bed Bug Control, Ant Control |
| `cat-9` | Appliance Repair | `appliance-repair` | `settings` | Washing Machine Repair, Fridge Repair, TV Wall Mount, Geyser Repair |
| `cat-10` | Locksmith | `locksmith` | `lock` | Emergency Unlocking, Key Duplication, Smart Lock Install, Door Closer |
| `cat-11` | CCTV & Security | `cctv-security` | `camera` | CCTV Installation, Video Doorbell Setup, DVR Configuration, Fault Repair |
| `cat-12` | Gardening | `gardening` | `leaf` | Lawn Mowing, Plant Pruning, Balcony Garden Setup, Pesticide Spray |

### Data Schema per Object:
```javascript
{
  id: "cat-1",
  name: "Electrician",
  slug: "electrician",
  icon: "zap",
  description: "Expert electrical repairs, wiring, and installations for your home.",
  serviceCount: 124,
  popularServices: ["Fan Installation", "Switchboard Repair", "Inverter Setup", "Wiring"]
}
```

### Usage in Job Posting and Filtering:
- **Job Form Category Selector**: Populate the dropdown `<select id="job-category">` dynamically or statically using `categories.map(c => <option value="${c.id}">${c.name}</option>)`.
- **Job Card Category Display**: Match `job.categoryId` to `category.icon` and `category.name` for rendering badges and icons.
- **Job Filter Bar**: Use `categories` to generate filter pills or sidebar radio/checkbox options.

---

## 6. CSS System & Design Tokens

### Token System (`css/variables.css`)
Theme tokens are structured under `:root, [data-theme="dark"]` and `[data-theme="light"]`:

#### Surface Colors:
| Token | Dark Theme | Light Theme | Usage |
|---|---|---|---|
| `--surface-primary` | `#0a1628` | `#f8fafc` | Page body background |
| `--surface-secondary` | `#1a2d4a` | `#ffffff` | Card surfaces, modal containers |
| `--surface-elevated` | `#243b5e` | `#f1f5f9` | Toast background, input hovers, headers |
| `--surface-glass` | `rgba(26, 45, 74, 0.6)` | `rgba(255, 255, 255, 0.7)` | Glassmorphism panels |

#### Text Colors:
| Token | Dark Theme | Light Theme | Usage |
|---|---|---|---|
| `--text-primary` | `#f8fafc` | `#0f172a` | Headings, primary text |
| `--text-secondary` | `#94a3b8` | `#475569` | Descriptions, subtitles |
| `--text-muted` | `#718096` | `#94a3b8` | Placeholder text, timestamps |

#### Accents & Status Colors:
| Token | Color Value | Typical Application |
|---|---|---|
| `--accent-blue` | `#3b82f6` | Brand primary, buttons, active links, "Low" urgency |
| `--accent-blue-hover` | `#2563eb` | Primary button hover |
| `--accent-emerald` | `#10b981` | Verified badge, success toasts, "Medium" urgency |
| `--accent-amber` | `#f59e0b` | Star ratings, warnings, "High" urgency |
| Rose / Red (`#ef4444`) | `#ef4444` | Form errors, "Urgent" urgency badge |

#### Spacing, Radii & Shadows:
- Spacing: `--spacing-1` (0.25rem) to `--spacing-24` (6rem)
- Radii: `--radius-md` (0.5rem), `--radius-lg` (0.75rem), `--radius-xl` (1rem), `--radius-full` (9999px)
- Shadows: `--shadow-md`, `--shadow-lg`, `--shadow-glow-primary`

### Responsive Breakpoints
- **Mobile**: `< 768px` (Single-column layout, mobile header with hamburger, full-width actions)
- **Tablet**: `768px - 1023px` (2-column grids, desktop header navigation)
- **Desktop**: `>= 1024px` (`.layout-with-sidebar` activates `grid-template-columns: 280px 1fr`, 3-4 column grids)
- **Max Container**: `max-width: 1280px` centered with auto margins

### Form Styling Tokens (`css/components.css:128-168`)
- Inputs must use:
  ```html
  <div class="input-group">
    <label class="input-label" for="field-id">Field Name</label>
    <input type="text" id="field-id" class="input-field" placeholder="..." required>
  </div>
  ```
- `.input-field` has native dark/light theme support, `:focus` state with blue border and glow (`--accent-blue-transparent`), `:user-invalid` and `:user-valid` indicators.

---

## 7. Requirements for `jobs.html` and Homepage Recent Jobs

### A. Dedicated Jobs Page (`jobs.html`)
The new `jobs.html` page must provide a full job discovery experience for professionals.

#### 1. Page Shell & Layout
- Top navigation with active highlight on `Jobs`.
- Page banner / hero:
  - Title: "Available Job Postings" / "Browse Open Jobs" with `data-char-reveal`.
  - Subtitle: "Explore customer service requests in your area and find your next project." with `data-animate="fade-up"`.
  - "Post a Job" action button for customers.
- Layout: `.layout-with-sidebar` container:
  - **Sidebar Filter Panel (`.sidebar-filters.glass-panel`)**:
    - Sticky sidebar (`top: 100px;`).
    - Search input for keyword filtering (title, description, location).
    - Category Filter: Dropdown or radio list covering "All Categories" + the 12 categories.
    - Urgency Filter: Checkbox/radio list (`All`, `Low`, `Medium`, `High`, `Urgent`).
    - Sort Selector: Dropdown (`Newest First`, `Budget: High to Low`, `Budget: Low to High`).
    - Clear Filters button (`#clear-filters-btn`).
  - **Main Content Area**:
    - Result count header (e.g. `Showing 8 open jobs`).
    - Responsive Jobs Grid (`#jobs-grid`):
      - 1 column on mobile, 2 columns on tablet/desktop.
    - Empty State (`#no-jobs-message`):
      - Hidden by default.
      - Displays search icon `<i data-lucide="briefcase">`, "No jobs found", and "Clear filters" or "Post a Job" action.

#### 2. Job Card Design Specification
```html
<div class="job-card card glass-panel" data-animate="fade-up">
  <div class="job-card-header">
    <div class="job-category-badge">
      <i data-lucide="${categoryIcon}"></i>
      <span>${categoryName}</span>
    </div>
    <span class="badge badge-urgency-${urgency}">${urgencyText}</span>
  </div>
  
  <h3 class="job-title">${job.title}</h3>
  <p class="job-description">${truncate(job.description, 120)}</p>
  
  <div class="job-meta-grid">
    <div class="job-meta-item">
      <i data-lucide="map-pin"></i>
      <span>${job.location}</span>
    </div>
    <div class="job-meta-item">
      <i data-lucide="indian-rupee"></i>
      <span class="job-budget font-semibold text-primary">₹${job.budget}</span>
    </div>
    <div class="job-meta-item">
      <i data-lucide="calendar"></i>
      <span>${formatDateTime(job.preferredDateTime)}</span>
    </div>
  </div>
  
  <div class="job-card-footer">
    <span class="job-time text-xs text-muted">
      <i data-lucide="clock" class="icon-sm inline"></i> ${relativeTime(job.createdAt)}
    </span>
    <button class="btn btn-outline btn-sm job-details-btn" data-job-id="${job.id}">
      View Details
    </button>
  </div>
</div>
```

### B. Homepage "Recent Jobs" Section (`index.html`)
- Placement: Inserted right after the Categories section or after the Featured Professionals section in `index.html`.
- Section Markup:
  ```html
  <section class="section recent-jobs-section">
    <div class="container">
      <div class="section-header flex justify-between items-center mb-10">
        <div>
          <h2 class="section-title" data-char-reveal>Recent Job Postings</h2>
          <p class="text-secondary mt-2">Latest requests from clients looking for skilled professionals</p>
        </div>
        <a href="./jobs.html" class="btn btn-ghost">View All Jobs <i data-lucide="chevron-right" class="icon-sm"></i></a>
      </div>
      <div class="recent-jobs-grid" id="recent-jobs-grid">
        <!-- Populated dynamically by home.js via jobService -->
      </div>
    </div>
  </section>
  ```
- Quantity: Latest 4 to 6 open jobs (`GET /api/jobs` sorted by newest).
- Responsiveness: 1 column mobile, 2 columns tablet, 3 columns desktop.
- Scroll Animations: Integrates `data-animate="fade-up"` and calls `observeNewElements(grid)`.

### C. Job Posting Form Modal Specification
To provide the smoothest UX without page reloads, a global job modal `#post-job-modal` should be injected into `document.body` (or mounted in `app.js`).

#### Form Fields Required:
1. **Title**: `<input type="text" id="job-title" class="input-field" placeholder="e.g. Electrical wiring repair in kitchen" required>`
2. **Category**: `<select id="job-category" class="input-field" required>` (populated with 12 categories)
3. **Description**: `<textarea id="job-description" class="input-field" rows="3" placeholder="Describe the work required in detail..." required></textarea>`
4. **Location**: `<input type="text" id="job-location" class="input-field" placeholder="e.g. Andheri West, Mumbai" required>` (auto-populated from `localStorage.getItem('user-location')` if set)
5. **Budget**: `<input type="text" id="job-budget" class="input-field" placeholder="e.g. ₹500 - ₹1,500 or fixed amount" required>`
6. **Urgency**: `<select id="job-urgency" class="input-field" required>` (`low`, `medium`, `high`, `urgent`)
7. **Preferred Date/Time**: `<input type="datetime-local" id="job-datetime" class="input-field" required>`
8. **Photos**: `<input type="text" id="job-photos" class="input-field" placeholder="Photo URL or comma-separated URLs (optional)">`

#### Validation & Submission Flow:
- Client-side validation: Ensure all required fields are non-empty.
- Submission:
  - Button state: disable button, show spinner.
  - Call `jobService.createJob(jobData)`.
  - On Success:
    - Display `showToast("Job posted successfully!", "success");`
    - Reset form and close modal.
    - If on `jobs.html`, refresh `#jobs-grid`. If on `index.html`, refresh `#recent-jobs-grid`.
    - Alternatively redirect to `./jobs.html`.
  - On Error:
    - Display error banner inside modal `<div id="job-error" class="auth-error-msg"></div>`.

---

## 8. Proposed New Files & Minimal Edit Plan

### New Files to Create:
1. `jobs.html` — The dedicated job listing page.
2. `css/jobs.css` — Styles for job cards, urgency badges, job modal, and job filters.
3. `js/services/jobService.js` — Client API service for `/api/jobs` (`getJobs`, `getJobById`, `createJob`, `deleteJob`).
4. `js/components/jobModal.js` — Job posting modal HTML, event listeners, form validation, and auth check.
5. `js/pages/jobs.js` — Job listing page orchestrator (data fetching, filtering, sorting, rendering).

### Files to Update Minimally (Zero Regression):
1. `index.html` — Add Recent Jobs section; add `Jobs` nav link in desktop & mobile header.
2. `services.html`, `category.html`, `professional.html`, `about.html`, `how-it-works.html` — Add `Jobs` nav link in desktop & mobile header.
3. `js/app.js` — Route handler for `jobs.html`, initialize `initJobModal()`.
4. `js/components/modal.js` — Wire "Post a Job" buttons to `openJobModal()` instead of showing "coming soon" toast.
5. `js/pages/home.js` — Call `renderRecentJobs()` to populate `#recent-jobs-grid`.
6. `js/components/footer.js` — Add `Browse Jobs` link under Platform section.

### Files strictly untouched:
- `js/components/authUI.js` (Protected)
- `js/services/authService.js` (Protected)

---

## Conclusion
The existing frontend is clean, modular, and well-structured for extending with the Post Jobs feature. All UI components follow predictable CSS variables and glassmorphism standards. Modal management and scroll animations have dedicated engines that can be effortlessly leveraged. Client authentication can be checked reliably at runtime via `authService.getMe()` and the global `window.authUI.openModal('login-modal')` without modifying any forbidden files.
