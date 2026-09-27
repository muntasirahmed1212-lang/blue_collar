# Handoff Report: Frontend Architectural Survey for "Post Jobs" Feature

**Agent**: `explorer_survey_2`  
**Handoff Type**: Hard (Task Complete)  
**Destination**: Parent Agent (`351c76c1-e33d-43bb-9963-aff2c2f2d29b`)  
**Artifact Referenced**: `.agents/teamwork/explorer_survey_2/survey_frontend.md`

---

## 1. Observation

### 1.1 "Post a Job" Buttons Across Existing HTML Pages
A direct inspection of all 6 HTML pages revealed hardcoded header markup containing two buttons per page:
- `index.html`: Desktop at line 87 (`<button class="btn btn-primary">Post a Job</button>`), Mobile drawer at line 125 (`<button class="btn btn-primary" style="width: 100%">Post a Job</button>`).
- `services.html`: Desktop at line 85, Mobile at line 123.
- `category.html`: Desktop at line 85, Mobile at line 123.
- `professional.html`: Desktop at line 84, Mobile at line 122.
- `about.html`: Desktop at line 86, Mobile at line 123.
- `how-it-works.html`: Desktop at line 86, Mobile at line 123.

### 1.2 Current Wiring in `js/components/modal.js`
In `js/components/modal.js:9-19`:
```javascript
  const postJobBtns = document.querySelectorAll('.btn-primary');
  postJobBtns.forEach(btn => {
    if(btn.textContent.trim().toLowerCase() === 'post a job') {
      btn.addEventListener('click', (e) => {
        if(e.target.tagName !== 'A') { // Avoid if it's already a link
          e.preventDefault();
          showToast("Post a Job feature coming soon!", "info");
        }
      });
    }
  });
```

### 1.3 Routing and Module Architecture in `js/app.js`
In `js/app.js:25-39`:
```javascript
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

### 1.4 Client Auth State Observation Mechanisms
In `js/services/authService.js:62-66`:
```javascript
  async getMe() {
    return fetchWithJSON('/me', {
      method: 'GET'
    });
  },
```
In `server/controllers/authController.js:168-179`:
```javascript
    if (!user.isVerified) {
      return res.status(403).json({ success: false, error: 'Please verify your email first.', needsVerification: true });
    }
    ...
    req.session.userId = user.id;
```
In `server/controllers/authController.js:232-242`:
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
In `js/components/authUI.js:13`:
```javascript
  window.authUI = { openModal, closeAllAuthModals };
```

### 1.5 Category Data Structure
In `js/data/categories.js:3-116`, 12 categories are defined:
- `cat-1`: Electrician (slug: "electrician", icon: "zap")
- `cat-2`: Plumber (slug: "plumber", icon: "wrench")
- `cat-3`: Carpenter (slug: "carpenter", icon: "hammer")
- `cat-4`: Painter (slug: "painter", icon: "paint-bucket")
- `cat-5`: Constructor (slug: "constructor", icon: "hard-hat")
- `cat-6`: AC Repair (slug: "ac-repair", icon: "snowflake")
- `cat-7`: Cleaning (slug: "cleaning", icon: "sparkles")
- `cat-8`: Pest Control (slug: "pest-control", icon: "shield")
- `cat-9`: Appliance Repair (slug: "appliance-repair", icon: "settings")
- `cat-10`: Locksmith (slug: "locksmith", icon: "lock")
- `cat-11`: CCTV & Security (slug: "cctv-security", icon: "camera")
- `cat-12`: Gardening (slug: "gardening", icon: "leaf")

### 1.6 Modal and Glassmorphism Styling
In `css/components.css:171-210`:
`.modal-overlay` uses `position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px); z-index: 1000;`.  
`.modal-overlay.hidden` is `display: none;`, and `.modal-overlay.visible` transitions `opacity: 1` and `transform: translateY(0) scale(1)`.  
In `css/global.css:162-167`:
```css
.glass-panel {
  background: var(--surface-glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
}
```

---

## 2. Logic Chain

1. **Header Button Wiring**: Because all 6 HTML pages already contain identical desktop and mobile `<button class="btn btn-primary">Post a Job</button>` elements, we do not need to alter their HTML element structure. Currently, `js/components/modal.js:9-19` queries these buttons and attaches the placeholder "coming soon" toast handler. By updating this handler (or replacing it with `initJobModal()`), the "Post a Job" buttons in both desktop and mobile headers across every page are immediately wired.
2. **Auth Verification Without Modifying Forbidden Files**: The user constraint strictly forbids modifying `js/components/authUI.js` or `js/services/authService.js`. Observations 1.4 show that `authService.getMe()` is an exported method making a `GET /api/auth/me` request, and `window.authUI.openModal('login-modal')` is exposed on `window`. Because the server controller only creates sessions for verified users (`user.isVerified === true`), calling `authService.getMe()` directly returns `{ success: true, user: { role: 'customer', ... } }` if and only if the user is authenticated and verified. If unauthenticated, calling `window.authUI.openModal('login-modal')` immediately prompts the user to log in.
3. **Form Experience: Modal vs Page**: Because the "Post a Job" buttons exist on all pages (home, category, services, pro profile, about, how-it-works), implementing the job posting form as a glassmorphism modal injected into `document.body` allows customers to post a job from any page without losing their place.
4. **Category Integration**: The 12 categories in `js/data/categories.js` have standardized `id` (`cat-1` to `cat-12`), `name`, `slug`, and `icon`. A dropdown `<select id="job-category">` populated with these 12 categories ensures 100% data consistency between client job creation and existing categories.
5. **Job Listing Architecture**:
   - `jobs.html` can adopt the existing `.layout-with-sidebar` layout from `category.html:28-39` (sidebar for category & urgency filters, main area for responsive grid).
   - In `js/app.js:25-39`, adding `else if (path.includes('jobs.html')) import('./pages/jobs.js').then(m => m.initJobs())` matches the existing dynamic import routing.
   - For `index.html`, adding `renderRecentJobs()` to `js/pages/home.js` and inserting a `<section class="section recent-jobs-section">` right after the categories section seamlessly displays the latest 4-6 jobs with `data-animate="fade-up"`.
6. **Navigation Link**: In `js/components/header.js:53-69`, `initHeader()` uses `currentPath.replace('/index.html', '/').includes(normalizedHref)` to highlight active links. Adding `<a href="./jobs.html" class="nav-link">Jobs</a>` to `.nav-links` and `.mobile-nav-links` will automatically receive the `.active` class when navigating to `/jobs.html`.

---

## 3. Caveats

1. **Role Gating Scope**: In `authController.js`, users default to `role: 'customer'`, and admins have `role: 'admin'`. Requirement R1 and R2 state: *"Only logged-in, verified users with the 'customer' role can create jobs."* If an admin attempts to post a job, should they be permitted or restricted? We recommend restricting to `'customer'` strictly as specified by R1/R2, or allowing admin as an override.
2. **Existing E2E Test Suite**: In `tests/e2e-login-modal.js:503-535`, Test 3 and Test 11 previously asserted that clicking "Post a Job" displayed the "Post a Job feature coming soon!" toast. That test suite was built for a previous milestone. The new requirement explicitly calls for replacing that toast with the real post-a-job workflow and writing a dedicated test suite (`tests/verify-jobs.js`).
3. **Backend API Contract Assumption**: Frontend assumes backend endpoints will follow the specification in R1/acceptance criteria:
   - `POST /api/jobs` -> `{ success: true, job: {...} }`
   - `GET /api/jobs` -> `{ success: true, jobs: [...] }`
   - `GET /api/jobs?category=<catId>&urgency=<urgency>` -> filtered list
   - `GET /api/jobs/:id` -> `{ success: true, job: {...} }`

---

## 4. Conclusion

The frontend architecture of BlueCollar Connect is completely surveyed, well-defined, and fully ready for implementation of the "Post Jobs" feature with zero regression:
1. **Header Buttons**: Located at lines 84-87 (desktop) and 122-125 (mobile) across all 6 HTML files.
2. **Wiring Point**: Modify `js/components/modal.js` (or replace with `js/components/jobModal.js`) to open `#post-job-modal`.
3. **Auth State Check**: Invoke `await authService.getMe()`. If unauthenticated, invoke `window.authUI.openModal('login-modal')`. If authenticated customer, open `#post-job-modal`.
4. **Category Dropdown**: Bound to `categories` from `js/data/categories.js` (12 categories).
5. **New Page (`jobs.html`)**: Built with `.layout-with-sidebar`, sticky `.sidebar-filters.glass-panel`, responsive `.job-card`s, and wired via `js/pages/jobs.js` in `js/app.js`.
6. **Homepage Preview**: Added as `<section class="section recent-jobs-section">` in `index.html` and populated by `renderRecentJobs()` in `js/pages/home.js`.
7. **Compliance**: `js/components/authUI.js` and `js/services/authService.js` remain completely untouched.

---

## 5. Verification Method

1. **Verify Button Locations**:
   Execute grep search for "Post a Job" across `index.html`, `services.html`, `category.html`, `professional.html`, `about.html`, `how-it-works.html`:
   ```powershell
   Select-String -Path "*.html" -Pattern "Post a Job"
   ```
2. **Inspect Existing Modal Architecture**:
   View `js/components/modal.js`, `js/components/location.js`, and `css/components.css` lines 171-210 to confirm modal classes (`.modal-overlay.hidden`, `.modal-overlay.visible`, `.modal-container`).
3. **Verify Auth Service Export & Endpoint**:
   Inspect `js/services/authService.js` line 62 and `server/controllers/authController.js` line 232 to verify `getMe()` contract and session requirements.
4. **Verify Category Schema**:
   Inspect `js/data/categories.js` to confirm all 12 items have `id`, `name`, `slug`, and `icon`.
5. **Invalidation Conditions**:
   - If `authService.getMe()` does not include `role`, an alternative client role-check would be needed (invalidated: verified that `res.user.role` is returned in line 241 of `authController.js`).
   - If modal CSS classes conflict with existing pages (invalidated: verified `.modal-overlay` and `.modal-container` are already globally declared in `css/components.css`).
