# Architecture & Implementation Plan: Jobs Page Controller (`js/pages/jobs.js`) & Routing (`js/app.js`)

**Author**: `explorer_m3_2`  
**Milestone**: M3 (Job Listing Page & Homepage Preview)  
**Target Files**:
- `js/pages/jobs.js` (New controller file)
- `js/app.js` (Dynamic routing addition)

---

## 1. Codebase Analysis of Existing Page Controllers

Before designing `js/pages/jobs.js`, we audited the existing page controllers in `js/pages/`:

### A. `js/pages/services.js`
- Imports `categories` from `../data/categories.js` and `observeNewElements` from `../utils/animations.js`.
- Exports `initServices()`.
- Obtains DOM element references (`#all-categories-grid`, `#category-filter`, `#no-results`).
- Defines an inner `renderGrid(data)` function that handles:
  1. Empty state check (`#no-results.classList.remove('hidden')`).
  2. Mapping category objects into responsive HTML template strings.
  3. Setting `grid.innerHTML`.
  4. Triggering icon creation: `if (window.lucide) window.lucide.createIcons()`.
  5. Triggering scroll animation observers: `observeNewElements(grid)`.
- Implements real-time text input filtering on `#category-filter`.

### B. `js/pages/category.js`
- Imports `getCategoryBySlug`, `getProfessionalsByCategory`, `getQueryParams`, `observeNewElements`.
- Parses URL search parameters using `getQueryParams()`.
- Maintains an in-memory `currentFilters` state object: `{ rating, verified, availability, sort }`.
- Defines `renderPros(pros)`:
  - Updates `#results-count` text (`Showing N professionals`).
  - Toggles `#no-pros-message` visibility.
  - Maps items to cards with badges, icons, and action buttons.
  - Calls `window.lucide.createIcons()` and `observeNewElements(grid)`.
- Defines `applyFiltersAndSort()` to filter and sort the in-memory array before rendering.
- Binds event listeners to `#apply-filters-btn`, `#sort-select`, `#reset-filters`, and `#clear-filters-btn`.

### C. `js/pages/home.js`
- Exports `initHome()` calling `renderCategories()` and `renderFeaturedPros()`.
- Slices datasets (e.g. first 8 categories, top 6 featured professionals).
- Renders responsive card grids and re-initializes Lucide icons and animations.

### D. `js/services/jobService.js` & `server/controllers/jobController.js` Contract
- `jobService.getJobs(params)` calls `GET /api/jobs` with optional query params (`category`, `urgency`, `location`, `status`, `sort`, `limit`).
- Returns standardized promise resolving to:
  ```json
  {
    "success": true,
    "count": 5,
    "total": 5,
    "jobs": [
      {
        "id": "uuid",
        "title": "Fix leaking kitchen pipe",
        "description": "Pipe under sink is leaking steadily...",
        "category": "cat-2",
        "categorySlug": "plumber",
        "categoryName": "Plumber",
        "location": "Downtown Manhattan",
        "budget": "$150 - $250",
        "urgency": "urgent",
        "preferredDate": "2026-10-01",
        "preferredTime": "Morning",
        "photos": [],
        "status": "open",
        "customerId": "cust-123",
        "customerName": "Alice Johnson",
        "customerEmail": "alice@example.com",
        "createdAt": "2026-09-25T19:30:00.000Z",
        "updatedAt": "2026-09-25T19:30:00.000Z"
      }
    ]
  }
  ```
- `jobModal.js` emits custom event on job submission:
  ```javascript
  document.dispatchEvent(new CustomEvent('job:created', { detail: res.job }));
  if (typeof window !== 'undefined' && window.jobsPageUI?.refreshJobs) {
    window.jobsPageUI.refreshJobs();
  }
  ```

---

## 2. Technical Design of `js/pages/jobs.js`

### 2.1 State Management
`filterState` tracks the active filter and sorting criteria:
```javascript
const filterState = {
  category: 'all',      // 'all' | 'cat-1'..'cat-12' | slug | name
  urgency: 'all',       // 'all' | 'urgent' | 'high' | 'medium' | 'low'
  location: '',         // lowercase trimmed search query
  sort: 'newest'        // 'newest' | 'oldest' | 'budget_desc' | 'budget_asc'
};
```
All jobs fetched from `jobService.getJobs({ status: 'open' })` are cached in `allJobs = []`. This enables:
1. **Sub-millisecond filtering & sorting**: Instant user feedback without network latency.
2. **Reduced server load**: Keystrokes in location search do not bombard the server.
3. **Seamless refresh**: When `job:created` fires or user refreshes, `loadJobs()` fetches fresh data from the server and reapplies the active filters immediately.

### 2.2 Relative Time Calculation (`formatRelativeTime`)
To deliver an intuitive UI, timestamps are converted into relative format:
- `< 45 seconds`: `"Just now"`
- `< 60 minutes`: `"X minutes ago"` (or `"1 minute ago"`)
- `< 24 hours`: `"X hours ago"` (or `"1 hour ago"`)
- `< 30 days`: `"X days ago"` (or `"1 day ago"`)
- `< 12 months`: `"X months ago"` (or `"1 month ago"`)
- `>= 12 months`: `"X years ago"` (or `"1 year ago"`)
- Invalid/missing timestamp: Fallback gracefully to `"Recently"`.

### 2.3 Category Icon & Name Resolution
Lookup against `categories` from `../data/categories.js`:
- Electrician (`cat-1`) -> `zap`
- Plumber (`cat-2`) -> `wrench`
- Carpenter (`cat-3`) -> `hammer`
- Painter (`cat-4`) -> `paint-bucket`
- Constructor (`cat-5`) -> `hard-hat`
- AC Repair (`cat-6`) -> `snowflake`
- Cleaning (`cat-7`) -> `sparkles`
- Pest Control (`cat-8`) -> `shield`
- Appliance Repair (`cat-9`) -> `settings`
- Locksmith (`cat-10`) -> `lock`
- CCTV & Security (`cat-11`) -> `camera`
- Gardening (`cat-12`) -> `leaf`
- Fallback: `briefcase`

### 2.4 Urgency Badge Configuration
| Urgency | Display Label | CSS Class | Icon | Semantic Meaning |
|---|---|---|---|---|
| `urgent` | Urgent | `badge-urgency-urgent` | `flame` | Emergency / Immediate assistance (Red) |
| `high` | High Priority | `badge-urgency-high` | `alert-circle` | Needed within 24-48 hours (Orange) |
| `medium` | Medium | `badge-urgency-medium` | `clock` | Standard scheduling (Blue) |
| `low` | Flexible | `badge-urgency-low` | `calendar` | Flexible timing / low urgency (Green) |

### 2.5 Job Card Structure
Each job card rendered into `#jobs-grid` contains:
1. **Header**: Category badge with category icon + name, urgency badge with icon + label.
2. **Body**:
   - Job title (`.job-title`)
   - Description excerpt (`.job-description`)
   - Meta grid (`.job-meta-grid`):
     - Location: `<i data-lucide="map-pin"></i> ${job.location}`
     - Budget: `<i data-lucide="banknote"></i> ${job.budget}`
     - Time posted: `<i data-lucide="clock"></i> ${formatRelativeTime(job.createdAt)}`
     - Preferred date: `<i data-lucide="calendar"></i> ${job.preferredDate}` (if not 'Flexible')
3. **Footer**:
   - Customer avatar icon + "Posted by ${job.customerName}"
   - Action buttons: "Details" (`.view-details-btn`) and "Apply Now" (`.apply-job-btn`).
4. **Security**: All text fields (`title`, `description`, `location`, `budget`, `customerName`, `id`) are sanitized with `escapeHTML()` to eliminate XSS risks.

### 2.6 Empty State & Loading State
- **Loading**: If `allJobs` is empty on initial load, a 4-card animated skeleton (`.job-card-skeleton`) renders into `#jobs-grid`.
- **Empty State**:
  - If no jobs match filters, `#results-count` shows `"0 jobs found"`.
  - If `#no-jobs-message` or `#no-results` exists in DOM, it is revealed.
  - If not in DOM, an inline glass-panel empty state card with a "Clear All Filters" button is injected directly into `#jobs-grid`.
- **Error State**: If `jobService.getJobs()` fails, a friendly error card with a "Try Again" button is rendered.

### 2.7 Filter Controls & Event Handlers
- **Category Filter**: Supports dropdown (`#filter-category` / `#category-filter`) and/or radio/checkbox controls. Automatically populates all 12 canonical categories if dropdown is empty.
- **Urgency Filter**: Supports dropdown (`#filter-urgency` / `#urgency-filter`) or radio controls.
- **Location Search**: Input (`#filter-location` / `#location-filter` / `#job-location-search`) with 250ms debouncing.
- **Sort Select**: Dropdown (`#sort-select` / `#filter-sort`) supporting:
  - `newest`: Newest first (`Date(b.createdAt) - Date(a.createdAt)`)
  - `oldest`: Oldest first (`Date(a.createdAt) - Date(b.createdAt)`)
  - `budget_desc` / `budget-high`: Highest budget first
  - `budget_asc` / `budget-low`: Lowest budget first
- **Reset Buttons**: `#reset-filters` and `#clear-filters-btn` reset all state and input values to default.
- **URL Parameter Sync**: Reads `?category=...`, `?urgency=...`, `?location=...`, `?sort=...` on initial page load using `getQueryParams()` from `../utils/helpers.js`.

### 2.8 Real-time Reactivity: `job:created` Custom Event
Subscribes to `document.addEventListener('job:created', () => refreshJobs())`.
Also registers `window.jobsPageUI = { refreshJobs }` for direct invocation compatibility with `jobModal.js`.
When a user posts a job via the modal on `jobs.html`, the grid refreshes immediately and the newly created job appears at the top marked with `"Just now"`.

---

## 3. Dynamic Routing in `js/app.js`

In `js/app.js`, the routing block uses `path.includes()` checks to load page controllers on demand:

```javascript
// Existing app.js routing:
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
} else if (path.includes('jobs.html') || path.endsWith('/jobs')) {
  import('./pages/jobs.js').then(module => module.initJobs());
}
```

This ensures `jobs.js` is code-split and only fetched over the network when navigating to `jobs.html`.

---

## 4. Drop-in Implementation Code

### 4.1 Exact Code for `js/pages/jobs.js`

```javascript
// js/pages/jobs.js
/**
 * BlueCollar Connect - Jobs Page Controller
 * Handles job listing, multi-facet filtering (category, urgency, location),
 * sorting, responsive card rendering, relative timestamps, and real-time refresh.
 */

import { categories } from '../data/categories.js';
import { jobService } from '../services/jobService.js';
import { observeNewElements } from '../utils/animations.js';
import { getQueryParams, showToast } from '../utils/helpers.js';

/**
 * Filter state holding active sidebar filters and sorting options
 */
const filterState = {
  category: 'all',
  urgency: 'all',
  location: '',
  sort: 'newest'
};

/**
 * Cache of all retrieved jobs from server
 */
let allJobs = [];

/**
 * Flag to ensure event listeners are only attached once per lifecycle
 */
let listenersInitialized = false;

/**
 * Maps urgency levels to badge classes, icons, and labels
 */
const URGENCY_CONFIG = {
  urgent: { label: 'Urgent', class: 'badge-urgency-urgent', icon: 'flame' },
  high: { label: 'High Priority', class: 'badge-urgency-high', icon: 'alert-circle' },
  medium: { label: 'Medium', class: 'badge-urgency-medium', icon: 'clock' },
  low: { label: 'Flexible', class: 'badge-urgency-low', icon: 'check-circle' }
};

/**
 * Escapes unsafe HTML characters to prevent XSS.
 *
 * @param {string|*} str - Raw input
 * @returns {string} Sanitized HTML-safe string
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats a date into a human-readable relative time string.
 *
 * @param {string|number|Date} dateInput - ISO date string or timestamp
 * @returns {string} Relative time string (e.g. "Just now", "5 minutes ago", "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return 'Recently';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Recently';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 45) {
    return 'Just now';
  }
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`;
  }
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
  }
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
  }
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`;
  }
  const diffInYears = Math.floor(diffInDays / 365);
  return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`;
}

/**
 * Extracts a numeric value from budget strings, objects, or numbers for sorting.
 *
 * @param {number|string|Object} budget
 * @returns {number}
 */
export function extractBudgetNumber(budget) {
  if (typeof budget === 'number') return isNaN(budget) ? 0 : budget;
  if (!budget) return 0;
  if (typeof budget === 'object') {
    return Number(budget.max || budget.min || 0);
  }
  const clean = String(budget).replace(/,/g, '');
  const matches = clean.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  return Number(matches[matches.length - 1]);
}

/**
 * Resolves category display name, Lucide icon, and slug from job data.
 *
 * @param {Object} job
 * @returns {{ name: string, icon: string, slug: string }}
 */
function getCategoryInfo(job) {
  const cat = categories.find(c =>
    c.id === job.category ||
    c.slug === job.category ||
    c.slug === job.categorySlug ||
    c.name.toLowerCase() === (job.categoryName || '').toLowerCase()
  );

  return {
    name: job.categoryName || (cat ? cat.name : 'General'),
    icon: cat ? cat.icon : 'briefcase',
    slug: cat ? cat.slug : (job.categorySlug || 'general')
  };
}

/**
 * Resolves urgency display label, badge class, and icon.
 *
 * @param {string} urgency
 * @returns {{ label: string, class: string, icon: string }}
 */
function getUrgencyConfig(urgency) {
  const key = String(urgency || 'medium').toLowerCase();
  return URGENCY_CONFIG[key] || {
    label: urgency ? urgency.charAt(0).toUpperCase() + urgency.slice(1) : 'Medium',
    class: 'badge-urgency-medium',
    icon: 'clock'
  };
}

/**
 * Debounce helper function for input event listeners.
 *
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
function debounce(fn, delay = 250) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

/**
 * Renders job cards into #jobs-grid with count and empty state management.
 *
 * @param {Array<Object>} jobsList - Array of job objects to display
 */
export function renderJobs(jobsList) {
  const grid = document.getElementById('jobs-grid');
  const countEl = document.getElementById('results-count') || document.getElementById('jobs-count');
  const emptyEl = document.getElementById('no-jobs-message') || document.getElementById('no-results');

  if (!grid) return;

  // 1. Update results counter
  if (countEl) {
    if (jobsList.length === 0) {
      countEl.textContent = '0 jobs found';
    } else {
      countEl.textContent = `Showing ${jobsList.length} open job${jobsList.length === 1 ? '' : 's'}`;
    }
  }

  // 2. Handle empty state
  if (jobsList.length === 0) {
    grid.innerHTML = '';
    if (emptyEl) {
      emptyEl.classList.remove('hidden');
      emptyEl.style.display = 'block';
    } else {
      grid.innerHTML = `
        <div class="no-jobs-card glass-panel text-center py-12 rounded-xl" style="grid-column: 1 / -1;">
          <i data-lucide="search-x" class="icon-xl mb-4 text-muted mx-auto" style="display: block; margin: 0 auto 1rem;"></i>
          <h3 class="font-bold text-lg mb-2">No Open Jobs Found</h3>
          <p class="text-secondary max-w-md mx-auto mb-6">
            There are currently no job postings matching your selected filters. Try broadening your criteria or reset your filters.
          </p>
          <button type="button" class="btn btn-outline" id="empty-clear-filters-btn">Clear All Filters</button>
        </div>
      `;
      const emptyBtn = document.getElementById('empty-clear-filters-btn');
      if (emptyBtn) {
        emptyBtn.addEventListener('click', resetFilters);
      }
    }
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Hide empty state element if present
  if (emptyEl) {
    emptyEl.classList.add('hidden');
    emptyEl.style.display = 'none';
  }

  // 3. Render responsive job cards
  const markup = jobsList.map(job => {
    const cat = getCategoryInfo(job);
    const urg = getUrgencyConfig(job.urgency);
    const relativeTime = formatRelativeTime(job.createdAt);
    const preferredDate = job.preferredDate && job.preferredDate !== 'Flexible'
      ? `<div class="job-meta-item" title="Preferred Date">
           <i data-lucide="calendar" class="icon-sm"></i>
           <span>${escapeHTML(job.preferredDate)}</span>
         </div>`
      : '';

    return `
      <div class="job-card card glass-panel" data-animate="fade-up" data-job-id="${escapeHTML(job.id)}">
        <div class="job-card-header">
          <div class="job-category-badge" title="Category: ${escapeHTML(cat.name)}">
            <i data-lucide="${cat.icon}" class="icon-sm"></i>
            <span>${escapeHTML(cat.name)}</span>
          </div>
          <span class="badge ${urg.class}" title="Urgency: ${escapeHTML(urg.label)}">
            <i data-lucide="${urg.icon}" class="icon-xs"></i>
            <span>${escapeHTML(urg.label)}</span>
          </span>
        </div>

        <div class="job-card-body">
          <h3 class="job-title">${escapeHTML(job.title)}</h3>
          <p class="job-description">${escapeHTML(job.description)}</p>

          <div class="job-meta-grid">
            <div class="job-meta-item" title="Location">
              <i data-lucide="map-pin" class="icon-sm"></i>
              <span>${escapeHTML(job.location)}</span>
            </div>
            <div class="job-meta-item job-budget" title="Budget">
              <i data-lucide="banknote" class="icon-sm"></i>
              <span class="budget-value">${escapeHTML(job.budget)}</span>
            </div>
            <div class="job-meta-item" title="Posted">
              <i data-lucide="clock" class="icon-sm"></i>
              <span>${relativeTime}</span>
            </div>
            ${preferredDate}
          </div>
        </div>

        <div class="job-card-footer">
          <div class="job-posted-by">
            <div class="customer-avatar-placeholder">
              <i data-lucide="user" class="icon-sm"></i>
            </div>
            <div class="customer-info">
              <span class="posted-by-label">Posted by</span>
              <span class="customer-name">${escapeHTML(job.customerName || 'Verified Customer')}</span>
            </div>
          </div>
          <div class="job-actions">
            <button type="button" class="btn btn-outline btn-sm job-action-btn view-details-btn" data-job-id="${escapeHTML(job.id)}">
              Details
            </button>
            <button type="button" class="btn btn-primary btn-sm job-action-btn apply-job-btn" data-job-id="${escapeHTML(job.id)}">
              Apply Now
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = markup;

  // 4. Trigger Lucide icons & scroll animation observer
  if (window.lucide) {
    window.lucide.createIcons();
  }
  observeNewElements(grid);
}

/**
 * Filters and sorts allJobs according to filterState, then triggers renderJobs.
 */
export function applyFiltersAndSort() {
  let filtered = [...allJobs];

  // 1. Filter by category
  if (filterState.category && filterState.category !== 'all') {
    const catQuery = filterState.category.toLowerCase().trim();
    filtered = filtered.filter(job => {
      if (!job) return false;
      const jCat = String(job.category || '').toLowerCase();
      const jSlug = String(job.categorySlug || '').toLowerCase();
      const jName = String(job.categoryName || '').toLowerCase();
      return jCat === catQuery || jSlug === catQuery || jName === catQuery;
    });
  }

  // 2. Filter by urgency
  if (filterState.urgency && filterState.urgency !== 'all') {
    const urgQuery = filterState.urgency.toLowerCase().trim();
    filtered = filtered.filter(job => {
      if (!job) return false;
      return String(job.urgency || '').toLowerCase() === urgQuery;
    });
  }

  // 3. Filter by location (substring match)
  if (filterState.location) {
    const locQuery = filterState.location.toLowerCase().trim();
    filtered = filtered.filter(job => {
      if (!job) return false;
      return String(job.location || '').toLowerCase().includes(locQuery);
    });
  }

  // 4. Sort
  const sortType = (filterState.sort || 'newest').toLowerCase();
  if (sortType === 'oldest') {
    filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } else if (sortType === 'budget_desc' || sortType === 'budget-desc' || sortType === 'budget-high') {
    filtered.sort((a, b) => extractBudgetNumber(b.budget) - extractBudgetNumber(a.budget));
  } else if (sortType === 'budget_asc' || sortType === 'budget-asc' || sortType === 'budget-low') {
    filtered.sort((a, b) => extractBudgetNumber(a.budget) - extractBudgetNumber(b.budget));
  } else {
    // Default: newest first
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  renderJobs(filtered);
}

/**
 * Resets all filter controls and state back to defaults.
 */
export function resetFilters() {
  filterState.category = 'all';
  filterState.urgency = 'all';
  filterState.location = '';
  filterState.sort = 'newest';

  // Reset category select / radios
  const catSelect = document.getElementById('filter-category') || document.getElementById('category-filter');
  if (catSelect) catSelect.value = 'all';
  document.querySelectorAll('input[name="category"], input[name="filter-category"]').forEach(r => {
    r.checked = r.value === 'all';
  });

  // Reset urgency select / radios
  const urgSelect = document.getElementById('filter-urgency') || document.getElementById('urgency-filter');
  if (urgSelect) urgSelect.value = 'all';
  document.querySelectorAll('input[name="urgency"], input[name="filter-urgency"]').forEach(r => {
    r.checked = r.value === 'all';
  });

  // Reset location input
  const locInput = document.getElementById('filter-location') || document.getElementById('location-filter') || document.getElementById('job-location-search');
  if (locInput) locInput.value = '';

  // Reset sort select
  const sortSelect = document.getElementById('sort-select') || document.getElementById('filter-sort');
  if (sortSelect) sortSelect.value = 'newest';

  applyFiltersAndSort();
}

/**
 * Handles action button clicks inside the job grid via event delegation.
 *
 * @param {MouseEvent} e
 */
function handleGridClick(e) {
  const applyBtn = e.target.closest('.apply-job-btn');
  if (applyBtn) {
    const jobId = applyBtn.dataset.jobId;
    const job = allJobs.find(j => j.id === jobId);
    if (job) {
      showToast(`Interest submitted for "${job.title}"! The customer has been notified.`, 'success');
    }
    return;
  }

  const detailsBtn = e.target.closest('.view-details-btn');
  if (detailsBtn) {
    const jobId = detailsBtn.dataset.jobId;
    const job = allJobs.find(j => j.id === jobId);
    if (job) {
      showToast(`Viewing details for: ${job.title}`, 'info');
    }
    return;
  }
}

/**
 * Ensures the category dropdown contains all 12 canonical categories.
 */
function populateCategoryFilter() {
  const catSelect = document.getElementById('filter-category') || document.getElementById('category-filter');
  if (catSelect && catSelect.options.length <= 1) {
    const existingVal = catSelect.value || 'all';
    catSelect.innerHTML = '<option value="all">All Categories</option>' +
      categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    catSelect.value = existingVal;
  }
}

/**
 * Synchronizes filterState and UI controls from URL query parameters.
 */
function syncWithURLParams() {
  const params = getQueryParams();

  if (params.category) {
    filterState.category = params.category;
    const catSelect = document.getElementById('filter-category') || document.getElementById('category-filter');
    if (catSelect) catSelect.value = params.category;
    const radio = document.querySelector(`input[name="category"][value="${params.category}"], input[name="filter-category"][value="${params.category}"]`);
    if (radio) radio.checked = true;
  }

  if (params.urgency) {
    filterState.urgency = params.urgency;
    const urgSelect = document.getElementById('filter-urgency') || document.getElementById('urgency-filter');
    if (urgSelect) urgSelect.value = params.urgency;
    const radio = document.querySelector(`input[name="urgency"][value="${params.urgency}"], input[name="filter-urgency"][value="${params.urgency}"]`);
    if (radio) radio.checked = true;
  }

  if (params.location) {
    filterState.location = params.location.toLowerCase();
    const locInput = document.getElementById('filter-location') || document.getElementById('location-filter') || document.getElementById('job-location-search');
    if (locInput) locInput.value = params.location;
  }

  if (params.sort) {
    filterState.sort = params.sort;
    const sortSelect = document.getElementById('sort-select') || document.getElementById('filter-sort');
    if (sortSelect) sortSelect.value = params.sort;
  }
}

/**
 * Fetches open jobs from the backend API via jobService and updates the UI.
 */
export async function loadJobs() {
  const grid = document.getElementById('jobs-grid');
  if (!grid) return;

  // Show skeleton cards on initial load if grid is empty
  if (allJobs.length === 0) {
    grid.innerHTML = Array(4).fill(0).map(() => `
      <div class="job-card-skeleton glass-panel card" style="min-height: 220px; opacity: 0.6; padding: 1.5rem;">
        <div style="height: 24px; width: 40%; background: var(--border-default); border-radius: 4px; margin-bottom: 12px;"></div>
        <div style="height: 20px; width: 80%; background: var(--border-default); border-radius: 4px; margin-bottom: 8px;"></div>
        <div style="height: 16px; width: 100%; background: var(--border-default); border-radius: 4px; margin-bottom: 6px;"></div>
        <div style="height: 16px; width: 60%; background: var(--border-default); border-radius: 4px; margin-bottom: 16px;"></div>
        <div style="height: 32px; width: 100%; background: var(--border-default); border-radius: 4px;"></div>
      </div>
    `).join('');
  }

  try {
    const res = await jobService.getJobs({ status: 'open' });
    if (res && res.success && Array.isArray(res.jobs)) {
      allJobs = res.jobs;
      applyFiltersAndSort();
    } else {
      const errorMsg = res?.error || 'Failed to load job postings.';
      grid.innerHTML = `
        <div class="no-jobs-card glass-panel text-center py-12 rounded-xl" style="grid-column: 1 / -1;">
          <i data-lucide="alert-circle" class="icon-xl mb-4 text-muted mx-auto" style="color: #ef4444; display: block; margin: 0 auto 1rem;"></i>
          <h3 class="font-bold text-lg mb-2">Unable to Load Jobs</h3>
          <p class="text-secondary max-w-md mx-auto mb-6">${escapeHTML(errorMsg)}</p>
          <button type="button" class="btn btn-outline" id="retry-jobs-btn">Try Again</button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      const retryBtn = document.getElementById('retry-jobs-btn');
      if (retryBtn) retryBtn.addEventListener('click', () => loadJobs());
    }
  } catch (err) {
    console.error('Error fetching jobs:', err);
    grid.innerHTML = `
      <div class="no-jobs-card glass-panel text-center py-12 rounded-xl" style="grid-column: 1 / -1;">
        <i data-lucide="alert-circle" class="icon-xl mb-4 text-muted mx-auto" style="color: #ef4444; display: block; margin: 0 auto 1rem;"></i>
        <h3 class="font-bold text-lg mb-2">Network Error</h3>
        <p class="text-secondary max-w-md mx-auto mb-6">Unable to connect to the server. Please check your connection.</p>
        <button type="button" class="btn btn-outline" id="retry-jobs-btn">Try Again</button>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    const retryBtn = document.getElementById('retry-jobs-btn');
    if (retryBtn) retryBtn.addEventListener('click', () => loadJobs());
  }
}

/**
 * Public alias for refreshing job list.
 */
export const refreshJobs = loadJobs;

/**
 * Main initialization entry point for the jobs listing page.
 * Invoked dynamically from js/app.js when browsing jobs.html.
 */
export function initJobs() {
  const grid = document.getElementById('jobs-grid');
  if (!grid) return;

  // 1. Populate category dropdown options if needed
  populateCategoryFilter();

  // 2. Pre-populate filters from URL query params
  syncWithURLParams();

  // 3. Attach sidebar and grid event listeners
  if (!listenersInitialized) {
    listenersInitialized = true;

    // Category Select
    const catSelect = document.getElementById('filter-category') || document.getElementById('category-filter');
    if (catSelect) {
      catSelect.addEventListener('change', (e) => {
        filterState.category = e.target.value;
        applyFiltersAndSort();
      });
    }

    // Category Radios / Checkboxes
    document.querySelectorAll('input[name="category"], input[name="filter-category"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          filterState.category = e.target.value;
          applyFiltersAndSort();
        }
      });
    });

    // Urgency Select
    const urgSelect = document.getElementById('filter-urgency') || document.getElementById('urgency-filter');
    if (urgSelect) {
      urgSelect.addEventListener('change', (e) => {
        filterState.urgency = e.target.value;
        applyFiltersAndSort();
      });
    }

    // Urgency Radios
    document.querySelectorAll('input[name="urgency"], input[name="filter-urgency"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          filterState.urgency = e.target.value;
          applyFiltersAndSort();
        }
      });
    });

    // Location Input (debounced at 250ms)
    const locInput = document.getElementById('filter-location') || document.getElementById('location-filter') || document.getElementById('job-location-search');
    if (locInput) {
      locInput.addEventListener('input', debounce((e) => {
        filterState.location = e.target.value.trim().toLowerCase();
        applyFiltersAndSort();
      }, 250));
    }

    // Sort Select
    const sortSelect = document.getElementById('sort-select') || document.getElementById('filter-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        filterState.sort = e.target.value;
        applyFiltersAndSort();
      });
    }

    // Apply Filters Button
    const applyBtn = document.getElementById('apply-filters-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', applyFiltersAndSort);
    }

    // Reset / Clear Filters Buttons
    const resetBtn = document.getElementById('reset-filters');
    if (resetBtn) {
      resetBtn.addEventListener('click', resetFilters);
    }
    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', resetFilters);
    }

    // Grid Event Delegation for Apply & Details buttons
    grid.addEventListener('click', handleGridClick);

    // Listen for custom 'job:created' event dispatched by jobModal.js
    document.addEventListener('job:created', () => {
      refreshJobs();
    });

    // Expose global interface for jobModal.js compatibility
    if (typeof window !== 'undefined') {
      window.jobsPageUI = window.jobsPageUI || {};
      window.jobsPageUI.refreshJobs = refreshJobs;
    }
  }

  // 4. Initial fetch of open jobs
  loadJobs();
}

export default {
  initJobs,
  loadJobs,
  refreshJobs,
  renderJobs,
  applyFiltersAndSort,
  resetFilters,
  formatRelativeTime,
  extractBudgetNumber,
  escapeHTML
};
```

---

### 4.2 Exact Changes to `js/app.js`

In `js/app.js`, update the dynamic routing block between lines 35 and 42:

#### Before:
```javascript
  } else if (path.includes('services.html')) {
    import('./pages/services.js').then(module => module.initServices());
  } else if (path.includes('category.html')) {
    import('./pages/category.js').then(module => module.initCategory());
  } else if (path.includes('professional.html')) {
    import('./pages/professional.js').then(module => module.initProfessional());
  }
```

#### After:
```javascript
  } else if (path.includes('services.html')) {
    import('./pages/services.js').then(module => module.initServices());
  } else if (path.includes('category.html')) {
    import('./pages/category.js').then(module => module.initCategory());
  } else if (path.includes('professional.html')) {
    import('./pages/professional.js').then(module => module.initProfessional());
  } else if (path.includes('jobs.html') || path.endsWith('/jobs')) {
    import('./pages/jobs.js').then(module => module.initJobs());
  }
```

---

## 5. Verification Plan

| Check | Expected Behavior | Verification Command / Step |
|---|---|---|
| Module Syntax | `js/pages/jobs.js` has valid ES module syntax without parsing errors | `node --check js/pages/jobs.js` |
| Routing Logic | `js/app.js` has valid ES module syntax and includes jobs route | `node --check js/app.js` |
| Zero Regressions | `authUI.js` and `authService.js` remain strictly unmodified | `git status` check |
| Endpoints Health | Server starts cleanly and existing test suites pass | `node tests/verify-jobs.js` |
| Filter Coverage | Category, urgency, location, and sort operations filter jobs properly | Programmatic verification script |
| Real-time Event | `job:created` event triggers `refreshJobs()` | Simulated CustomEvent trigger |
