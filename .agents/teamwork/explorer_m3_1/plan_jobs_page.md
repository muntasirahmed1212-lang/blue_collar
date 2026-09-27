# Dedicated Job Listing Page Plan: `jobs.html` & `css/jobs.css`

## Executive Summary
This document specifies the exact production-ready design, HTML markup, and CSS styling for the dedicated job browsing page `jobs.html` and its stylesheet `css/jobs.css`.
The implementation perfectly mirrors the established design language of BlueCollar Connect (`services.html`, `category.html`, `css/variables.css`, `css/components.css`) while delivering a responsive, accessible, and high-performance user experience for blue-collar professionals searching for open customer jobs.

---

## 1. Architectural Alignment & Existing Page Mirroring

### 1.1 Structural Comparison
| Component | Existing Pattern in `category.html` & `services.html` | Specification for `jobs.html` |
|---|---|---|
| **Theme Init Script** | Inline script in `<head>` preventing theme flicker | Exact replica in `<head>` checking `localStorage.theme` |
| **Header & Desktop Nav** | `.nav-desktop` with Home, Services, How It Works, Verified Pros | Add `<a href="./jobs.html" class="nav-link active">Jobs</a>` |
| **Mobile Drawer Nav** | `.mobile-nav-links` with animated staggered links | Includes Jobs link with `.active` class |
| **Header Actions** | Location button, Theme dropdown, Login btn, Post a Job btn | Exact replica; triggers `initAuth()`, `initLocation()`, and `initJobModal()` seamlessly |
| **Hero / Breadcrumbs** | `.category-hero` with breadcrumb trail and large icon box | `.jobs-hero` with `Home > Open Jobs` breadcrumb, `briefcase` icon, and title "Browse Open Jobs" |
| **Layout Container** | `.container.layout-with-sidebar` (`grid-template-columns: 280px 1fr` on desktop) | Identical responsive two-column grid layout |
| **Sidebar Filters** | `.sidebar-filters.glass-panel` with sticky positioning | Sticky glassmorphic panel with filter groups for location, category, urgency, and reset action |
| **Main Content Header** | Results counter + sort dropdown control | `#results-count` + `#sort-select` (Newest, Oldest, Budget High-to-Low, Budget Low-to-High) |
| **Cards Grid** | Grid with `.card` styling and responsive column rules | `#jobs-grid` (1 column on mobile, 2 columns on tablet/desktop) |
| **Empty State** | Glass panel with `search-x` icon and clear button | `#no-jobs-message` with `search-x` icon, explanatory text, and `#clear-filters-btn` |
| **Footer & Modals** | Dynamic `renderFooter()` target + `#location-modal` | Included identically at bottom of `jobs.html` |

---

## 2. Responsive Job Card Specification

### 2.1 Job Card HTML Template
Each job card in `#jobs-grid` is rendered with semantic markup and accessible data attributes:

```html
<article class="job-card card" data-animate="fade-up" data-job-id="${job.id}">
  <!-- 1. Header: Category Badge & Urgency Indicator Badge -->
  <div class="job-card-header">
    <span class="job-category-badge badge">
      <i data-lucide="${catIcon}" class="icon-sm"></i>
      <span>${escapeHtml(job.categoryName)}</span>
    </span>
    <span class="job-urgency-badge badge badge-urgency-${job.urgency}">
      <span class="urgency-dot dot-${job.urgency}"></span>
      <span class="urgency-text">${capitalizedUrgency}</span>
    </span>
  </div>

  <!-- 2. Body: Title, Description, & Metadata Grid -->
  <div class="job-card-body">
    <h3 class="job-title" title="${escapeHtml(job.title)}">
      ${escapeHtml(job.title)}
    </h3>
    <p class="job-description">
      ${escapeHtml(job.description)}
    </p>

    <!-- Meta Tags Grid -->
    <div class="job-meta-grid">
      <!-- Location -->
      <div class="job-meta-item job-meta-location" title="${escapeHtml(job.location)}">
        <i data-lucide="map-pin" class="icon-sm text-muted"></i>
        <span>${escapeHtml(job.location)}</span>
      </div>
      <!-- Budget -->
      <div class="job-meta-item job-meta-budget" title="Project Budget">
        <i data-lucide="wallet" class="icon-sm text-muted"></i>
        <span class="job-budget-value">${escapeHtml(job.budget)}</span>
      </div>
      <!-- Time Posted (Relative) -->
      <div class="job-meta-item job-meta-time" title="Time Posted">
        <i data-lucide="calendar" class="icon-sm text-muted"></i>
        <span>${relativeTime}</span>
      </div>
      <!-- Customer Info -->
      <div class="job-meta-item job-meta-customer" title="Posted by ${escapeHtml(job.customerName)}">
        <i data-lucide="user" class="icon-sm text-muted"></i>
        <span>${escapeHtml(job.customerName || 'Customer')}</span>
      </div>
    </div>
  </div>

  <!-- 3. Footer: Status & Action Buttons -->
  <div class="job-card-footer">
    <div class="job-footer-status">
      <span class="status-indicator-dot"></span>
      <span class="text-xs text-secondary font-medium">Open</span>
    </div>
    <div class="job-actions">
      <button type="button" class="btn btn-outline btn-sm view-details-btn" data-job-id="${job.id}">
        View Details
      </button>
      <button type="button" class="btn btn-primary btn-sm apply-job-btn" data-job-id="${job.id}">
        Apply Now
      </button>
    </div>
  </div>
</article>
```

### 2.2 Color Tokens for Urgency Levels
Mapped strictly in accordance with design guidelines:
- **Urgent**: `#ef4444` (Red) / Background `rgba(239, 68, 68, 0.15)` / Border `rgba(239, 68, 68, 0.3)`
- **High**: `var(--accent-amber)` / `#f59e0b` (Orange) / Background `rgba(245, 158, 11, 0.15)` / Border `rgba(245, 158, 11, 0.3)`
- **Medium**: `var(--accent-blue)` / `#3b82f6` (Blue) / Background `var(--accent-blue-transparent)` / Border `rgba(59, 130, 246, 0.3)`
- **Low**: `var(--accent-emerald)` / `#10b981` (Green) / Background `var(--accent-emerald-transparent)` / Border `rgba(16, 185, 129, 0.3)`

---

## 3. Sidebar Filter Controls & Synchronized Selectors

To guarantee 100% interoperability with controller logic (`js/pages/jobs.js`):
1. **Location Search Input**:
   - Element ID: `#filter-location`
   - Type: `text` with map-pin icon
   - Debounced substring filter matching `job.location`.
2. **Category Filter**:
   - Element ID: `#filter-category` (Dropdown `<select>` with "All Categories" + 12 categories)
   - Checkbox Group: `.category-checkbox` (with `name="category"` and `value="cat-1"` through `value="cat-12"`)
   - Scrollable list `.category-scroll-list` for smooth browsing without layout distortion.
3. **Urgency Filter**:
   - Element ID: `#filter-urgency` (Dropdown `<select>` with `all`, `urgent`, `high`, `medium`, `low`)
   - Radio Group: `input[name="urgency"]` (with color dots for `urgent`, `high`, `medium`, `low`)
4. **Sort Selector**:
   - Element ID: `#sort-select`
   - Options:
     - `newest` (Newest First) [Default]
     - `oldest` (Oldest First)
     - `budget-desc` (Budget: High to Low)
     - `budget-asc` (Budget: Low to High)
5. **Reset & Clear Buttons**:
   - `#reset-filters` (inside sidebar header)
   - `#clear-filters-btn` (inside empty state container)
   - `#apply-filters-btn` (explicit apply button for mobile accessibility)

---

## 4. Full Source Code for `jobs.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <script>
    (function(){
      const t = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', t);
    })();
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <meta name="description" content="Browse open blue-collar job requests. Connect with local customers needing electrical, plumbing, carpentry, cleaning, and renovation services.">
  <meta name="keywords" content="open jobs, contractor jobs, electrician jobs, plumber jobs, carpenter jobs, handyman leads, BlueCollar Connect">
  <link rel="icon" href="./favicon.svg" type="image/svg+xml">

  <title>Browse Open Jobs | BlueCollar Connect</title>
  
  <!-- Performance Preconnects -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://unpkg.com">

  <!-- CSS -->
  <link rel="stylesheet" href="./css/reset.css">
  <link rel="stylesheet" href="./css/variables.css">
  <link rel="stylesheet" href="./css/global.css">
  <link rel="stylesheet" href="./css/transitions.css">
  <link rel="stylesheet" href="./css/components.css">
  <link rel="stylesheet" href="./css/auth.css">
  <link rel="stylesheet" href="./css/scroll-animations.css">
  <link rel="stylesheet" href="./css/header.css">
  <link rel="stylesheet" href="./css/footer.css">
  <link rel="stylesheet" href="./css/jobs.css">

  <!-- Icons (Lucide) -->
  <script src="https://unpkg.com/lucide@latest"></script>
  <link rel="expect" href="#main-content" blocking="render">
</head>
<body>

  <!-- Header -->
  <header>
    <div class="container header-container">
      <a href="./index.html" class="logo-container">
        <i data-lucide="wrench"></i>
        <div class="logo-text">
          <span>BlueCollar</span>
          <span class="logo-text-primary">Connect</span>
        </div>
      </a>
      
      <nav class="nav-desktop">
        <div class="nav-links">
          <a href="./index.html" class="nav-link">Home</a>
          <a href="./services.html" class="nav-link">Services</a>
          <a href="./jobs.html" class="nav-link active">Jobs</a>
          <a href="/how-it-works.html" class="nav-link">How It Works</a>
          <a href="./services.html?verified=true" class="nav-link">Verified Pros</a>
        </div>
      </nav>

      <div class="header-actions">
        <button class="btn btn-ghost global-location-btn" title="Set Location" style="padding: var(--spacing-2) var(--spacing-3);">
          <i data-lucide="map-pin"></i>
          <span class="location-text" style="font-weight: 500;">Set Location</span>
        </button>

        <div class="theme-dropdown-container">
          <button class="theme-toggle" aria-label="Toggle theme" aria-haspopup="true" aria-expanded="false" title="Theme Settings">
            <i data-lucide="monitor"></i>
          </button>
          <div class="theme-dropdown-menu">
            <button class="theme-option" data-theme-value="light">
              <i data-lucide="sun"></i> Light
            </button>
            <button class="theme-option" data-theme-value="dark">
              <i data-lucide="moon"></i> Dark
            </button>
            <button class="theme-option" data-theme-value="system">
              <i data-lucide="monitor"></i> System
            </button>
          </div>
        </div>
        <button class="btn btn-ghost">Login</button>
        <button class="btn btn-primary">Post a Job</button>
      </div>

      <button class="mobile-menu-btn" aria-label="Toggle menu">
        <i data-lucide="menu"></i>
      </button>
    </div>

    <!-- Mobile Drawer Menu -->
    <div class="mobile-menu">
      <nav class="mobile-nav-links">
        <a href="./index.html" class="nav-link">Home</a>
        <a href="./services.html" class="nav-link">Services</a>
        <a href="./jobs.html" class="nav-link active">Jobs</a>
        <a href="/how-it-works.html" class="nav-link">How It Works</a>
        <a href="./services.html?verified=true" class="nav-link">Verified Pros</a>
      </nav>
      <div class="mobile-actions">
        <button class="btn btn-outline global-location-btn" style="width: 100%; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <i data-lucide="map-pin"></i> <span class="location-text">Set Location</span>
        </button>

        <div class="theme-dropdown-container" style="width: 100%; margin-bottom: 12px;">
          <button class="theme-toggle mobile-theme-toggle" aria-label="Toggle theme" aria-haspopup="true" aria-expanded="false" style="width: 100%; display: flex; align-items: center; justify-content: center; padding: 12px; background: transparent; border: 1px solid var(--border-default); border-radius: var(--radius-md); color: var(--text-primary);">
            <i data-lucide="monitor"></i> <span style="margin-left: 8px;">Theme Settings</span>
          </button>
          <div class="theme-dropdown-menu mobile-dropdown">
            <button class="theme-option" data-theme-value="light">
              <i data-lucide="sun"></i> Light
            </button>
            <button class="theme-option" data-theme-value="dark">
              <i data-lucide="moon"></i> Dark
            </button>
            <button class="theme-option" data-theme-value="system">
              <i data-lucide="monitor"></i> System
            </button>
          </div>
        </div>
        <button class="btn btn-outline" style="width: 100%">Login</button>
        <button class="btn btn-primary" style="width: 100%">Post a Job</button>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main id="main-content" class="page-top-padding">
    
    <!-- Hero / Breadcrumb Section -->
    <div class="jobs-hero">
      <div class="container">
        <div class="breadcrumb mb-4" data-animate="fade-up">
          <a href="./index.html">Home</a> 
          <i data-lucide="chevron-right" class="icon-sm mx-1"></i>
          <span id="breadcrumb-current" class="text-primary">Open Jobs</span>
        </div>
        
        <div class="flex items-center gap-4 mb-2" data-animate="fade-up">
          <div class="jobs-hero-icon text-primary">
            <i data-lucide="briefcase"></i>
          </div>
          <h1>Browse Open Jobs</h1>
        </div>
        <p class="text-secondary max-w-2xl mb-6" data-animate="fade-up">
          Connect directly with verified local customers. Explore open project requests across 12 trades, review requirements, and submit competitive proposals.
        </p>
      </div>
    </div>

    <!-- Main Listing Section -->
    <section class="section pt-8">
      <div class="container layout-with-sidebar">
        
        <!-- Sidebar Filters -->
        <aside class="sidebar-filters glass-panel" data-animate="fade-up">
          <div class="filter-header mb-6 flex justify-between items-center">
            <h3 class="font-bold flex items-center gap-2">
              <i data-lucide="sliders-horizontal" class="icon-sm text-primary"></i>
              Filters
            </h3>
            <button id="reset-filters" class="btn btn-ghost" style="padding: 0; font-size: var(--text-sm);" type="button">Reset</button>
          </div>

          <!-- 1. Location Search Filter -->
          <div class="filter-group">
            <h4 class="filter-title">Location</h4>
            <div class="filter-search-box">
              <i data-lucide="map-pin" class="icon-sm text-muted"></i>
              <input 
                type="text" 
                id="filter-location" 
                placeholder="Filter by city or area..." 
                class="input-field filter-input-field" 
                autocomplete="off"
              >
            </div>
          </div>

          <!-- 2. Category Filter (Select + Checkbox list) -->
          <div class="filter-group">
            <div class="flex justify-between items-center mb-2">
              <h4 class="filter-title mb-0">Category</h4>
              <span class="text-xs text-muted" id="category-filter-count">12 Trades</span>
            </div>

            <!-- Compact Select Dropdown (Active for fast single selection) -->
            <div class="category-select-wrapper mb-3">
              <select id="filter-category" class="input-field">
                <option value="all" selected>All Categories (12)</option>
                <option value="cat-1">Electrician</option>
                <option value="cat-2">Plumber</option>
                <option value="cat-3">Carpenter</option>
                <option value="cat-4">Painter</option>
                <option value="cat-5">Constructor</option>
                <option value="cat-6">AC Repair</option>
                <option value="cat-7">Cleaning</option>
                <option value="cat-8">Pest Control</option>
                <option value="cat-9">Appliance Repair</option>
                <option value="cat-10">Locksmith</option>
                <option value="cat-11">CCTV & Security</option>
                <option value="cat-12">Gardening</option>
              </select>
            </div>

            <!-- Scrollable Checkbox List -->
            <div class="category-checkbox-container">
              <div class="checkbox-list category-scroll-list" id="category-checkbox-list">
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="all" checked>
                  <span>All Categories</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-1">
                  <span>Electrician</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-2">
                  <span>Plumber</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-3">
                  <span>Carpenter</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-4">
                  <span>Painter</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-5">
                  <span>Constructor</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-6">
                  <span>AC Repair</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-7">
                  <span>Cleaning</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-8">
                  <span>Pest Control</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-9">
                  <span>Appliance Repair</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-10">
                  <span>Locksmith</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-11">
                  <span>CCTV & Security</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" class="category-checkbox" name="category" value="cat-12">
                  <span>Gardening</span>
                </label>
              </div>
            </div>
          </div>

          <!-- 3. Urgency Filter -->
          <div class="filter-group">
            <h4 class="filter-title">Urgency</h4>
            
            <div class="radio-list urgency-radio-list" id="urgency-radio-list">
              <label class="radio-label">
                <input type="radio" name="urgency" value="all" checked>
                <span>All Levels</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="urgency" value="urgent">
                <span class="urgency-dot dot-urgent"></span>
                <span>Urgent (Emergency)</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="urgency" value="high">
                <span class="urgency-dot dot-high"></span>
                <span>High (&lt; 24 hrs)</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="urgency" value="medium">
                <span class="urgency-dot dot-medium"></span>
                <span>Medium (2–3 days)</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="urgency" value="low">
                <span class="urgency-dot dot-low"></span>
                <span>Low (Flexible)</span>
              </label>
            </div>
          </div>

          <button id="apply-filters-btn" class="btn btn-primary" style="width: 100%;">
            <i data-lucide="filter" class="icon-sm"></i> Apply Filters
          </button>
        </aside>

        <!-- Main Content Area -->
        <div class="main-content">
          <!-- Results Header & Sort Controls -->
          <div class="results-header flex justify-between items-center mb-6">
            <div id="results-count" class="text-secondary font-medium">
              Loading open jobs...
            </div>
            
            <div class="sort-control flex items-center gap-2">
              <span class="text-sm text-secondary">Sort by:</span>
              <select id="sort-select" class="input-field sort-select-input">
                <option value="newest" selected>Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="budget-desc">Budget: High to Low</option>
                <option value="budget-asc">Budget: Low to High</option>
              </select>
            </div>
          </div>

          <!-- Job Cards Grid -->
          <div class="jobs-grid" id="jobs-grid" aria-live="polite">
            <!-- Dynamic Job Cards injected by js/pages/jobs.js -->
          </div>

          <!-- Empty State -->
          <div id="no-jobs-message" class="hidden text-center py-12 text-secondary glass-panel rounded-xl mt-4">
            <div class="empty-state-icon-wrapper mb-4">
              <i data-lucide="search-x" class="icon-xl text-muted mx-auto"></i>
            </div>
            <h3 class="text-xl font-bold text-primary mb-2">No jobs found matching your criteria</h3>
            <p class="text-secondary text-sm max-w-prose mx-auto mb-6">
              There are currently no active job postings matching your selected filters. Try broadening your trade categories, changing urgency levels, or clearing search keywords.
            </p>
            <button class="btn btn-outline" id="clear-filters-btn">
              <i data-lucide="rotate-ccw" class="icon-sm"></i> Clear All Filters
            </button>
          </div>
        </div>

      </div>
    </section>
  </main>

  <!-- Footer (Rendered dynamically by js/components/footer.js) -->
  <footer></footer>

  <!-- Scripts -->
  <script type="module" src="./js/app.js"></script>

  <!-- Location Modal -->
  <div id="location-modal" class="modal-overlay hidden">
    <div class="modal-container">
      <div class="modal-header">
        <h3>Set Your Location</h3>
        <button class="modal-close" aria-label="Close location modal"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <button id="btn-use-current-location" class="btn btn-primary" style="width: 100%; margin-bottom: var(--spacing-4);">
          <i data-lucide="crosshair"></i> Use My Current Location
        </button>
        <div style="text-align: center; margin-bottom: var(--spacing-4); color: var(--text-muted); font-size: var(--text-sm);">
          — OR ENTER MANUALLY —
        </div>
        <div class="search-input-group" style="border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: var(--spacing-2); display: flex; align-items: center; gap: var(--spacing-2);">
          <i data-lucide="map-pin" class="text-muted"></i>
          <input type="text" id="manual-location-input" placeholder="Enter city, neighborhood, or zip..." style="border: none; background: transparent; outline: none; flex: 1; color: var(--text-primary); width: 100%;">
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: var(--spacing-2); margin-top: var(--spacing-6);">
        <button class="btn btn-ghost modal-close-btn">Cancel</button>
        <button id="btn-save-location" class="btn btn-primary">Save</button>
      </div>
    </div>
  </div>

  <!-- Job Details Modal (Accessible View Modal) -->
  <div id="job-details-modal" class="modal-overlay hidden" data-modal="job-details" aria-hidden="true" role="dialog" aria-labelledby="job-details-title">
    <div class="modal-container glass-panel job-details-container" role="document">
      <div class="modal-header">
        <div class="modal-header-content">
          <div id="job-details-category-badge" class="badge mb-2">Category</div>
          <h3 id="job-details-title" class="modal-title">Job Details</h3>
        </div>
        <button type="button" class="modal-close" id="job-details-close-btn" aria-label="Close modal">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body job-details-body">
        <div class="job-details-meta-bar mb-4">
          <div class="details-meta-chip"><i data-lucide="map-pin"></i> <span id="job-details-location">Location</span></div>
          <div class="details-meta-chip"><i data-lucide="wallet"></i> <span id="job-details-budget">Budget</span></div>
          <div class="details-meta-chip"><i data-lucide="alert-circle"></i> <span id="job-details-urgency">Urgency</span></div>
          <div class="details-meta-chip"><i data-lucide="calendar"></i> <span id="job-details-date">Date</span></div>
        </div>
        <div class="mb-4">
          <h4 class="text-sm text-secondary font-semibold uppercase tracking-wider mb-2">Description</h4>
          <p id="job-details-description" class="text-primary leading-relaxed"></p>
        </div>
        <div class="job-details-customer-card glass-panel p-4 rounded-lg mb-4">
          <div class="flex items-center gap-3">
            <div class="customer-avatar-box">
              <i data-lucide="user" class="icon-md text-primary"></i>
            </div>
            <div>
              <div class="text-xs text-muted">Posted by Customer</div>
              <div id="job-details-customer" class="font-bold text-primary">Customer Name</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer job-details-footer">
        <button type="button" class="btn btn-ghost modal-close-btn" id="job-details-back-btn">Close</button>
        <button type="button" class="btn btn-primary" id="job-details-apply-btn">
          <i data-lucide="send" class="icon-sm"></i> Apply for this Job
        </button>
      </div>
    </div>
  </div>

</body>
</html>
```

---

## 5. Full Source Code for `css/jobs.css`

```css
/* ==========================================================================
   css/jobs.css — Dedicated Job Listing Page & Job Card Styling
   BlueCollar Connect Design System Tokens & Glassmorphism
   ========================================================================== */

/* ─── 1. Hero & Banner ─────────────────────────────────────────────────── */
.jobs-hero {
  background: radial-gradient(circle at top center, rgba(59, 130, 246, 0.08) 0%, transparent 70%), var(--surface-secondary);
  border-bottom: 1px solid var(--border-default);
  padding: var(--spacing-8) 0;
}

.jobs-hero-icon {
  background: var(--brand-primary-transparent);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: var(--radius-md);
  padding: var(--spacing-2);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
}

.jobs-hero-icon .icon {
  width: 24px;
  height: 24px;
}

/* ─── 2. Layout & Sidebar ──────────────────────────────────────────────── */
.layout-with-sidebar {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-8);
}

@media (min-width: 1024px) {
  .layout-with-sidebar {
    grid-template-columns: 290px 1fr;
  }
}

.sidebar-filters {
  padding: var(--spacing-6);
  border-radius: var(--radius-xl);
  height: fit-content;
  position: sticky;
  top: 100px;
  background: var(--surface-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-md);
}

.filter-group {
  margin-bottom: var(--spacing-6);
  padding-bottom: var(--spacing-6);
  border-bottom: 1px solid var(--border-default);
}

.filter-group:last-of-type {
  border-bottom: none;
  margin-bottom: var(--spacing-4);
  padding-bottom: 0;
}

.filter-title {
  font-size: var(--text-base);
  font-weight: 600;
  margin-bottom: var(--spacing-3);
  color: var(--text-primary);
}

/* Location Filter Input */
.filter-search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.filter-search-box .icon,
.filter-search-box i {
  position: absolute;
  left: var(--spacing-3);
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.filter-input-field {
  padding-left: calc(var(--spacing-3) + 16px + var(--spacing-2)) !important;
  font-size: var(--text-sm);
  background-color: var(--surface-primary);
}

/* Category Checkboxes & Scroll List */
.category-scroll-list {
  max-height: 210px;
  overflow-y: auto;
  padding-right: var(--spacing-2);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  scrollbar-width: thin;
  scrollbar-color: var(--border-default) transparent;
}

.category-scroll-list::-webkit-scrollbar {
  width: 5px;
}

.category-scroll-list::-webkit-scrollbar-track {
  background: transparent;
}

.category-scroll-list::-webkit-scrollbar-thumb {
  background-color: var(--border-default);
  border-radius: var(--radius-full);
}

.checkbox-label,
.radio-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 3px 0;
  transition: color var(--transition-fast);
  user-select: none;
}

.checkbox-label:hover,
.radio-label:hover {
  color: var(--text-primary);
}

.checkbox-label input[type="checkbox"],
.radio-label input[type="radio"] {
  accent-color: var(--brand-primary);
  width: 16px;
  height: 16px;
  cursor: pointer;
  margin: 0;
}

/* ─── 3. Urgency Filter Dot & Badges ───────────────────────────────────── */
.urgency-radio-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.urgency-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.dot-urgent {
  background-color: #ef4444;
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.5);
}

.dot-high {
  background-color: var(--accent-amber);
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}

.dot-medium {
  background-color: var(--accent-blue);
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.5);
}

.dot-low {
  background-color: var(--accent-emerald);
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

/* Urgency Badges */
.job-urgency-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  text-transform: capitalize;
}

.badge-urgency-urgent {
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.badge-urgency-high {
  color: var(--accent-amber);
  background-color: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.badge-urgency-medium {
  color: var(--accent-blue);
  background-color: var(--accent-blue-transparent);
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.badge-urgency-low {
  color: var(--accent-emerald);
  background-color: var(--accent-emerald-transparent);
  border: 1px solid rgba(16, 185, 129, 0.3);
}

/* ─── 4. Results Header & Sorting ──────────────────────────────────────── */
.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-3);
}

.sort-select-input {
  padding: var(--spacing-2) var(--spacing-3) !important;
  border-radius: var(--radius-sm) !important;
  background-color: var(--surface-primary) !important;
  font-size: var(--text-sm) !important;
  cursor: pointer;
  width: auto !important;
}

/* ─── 5. Job Cards Grid ────────────────────────────────────────────────── */
.jobs-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-6);
}

@media (min-width: 768px) {
  .jobs-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Preview Grid used on homepage (index.html) */
.jobs-preview-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-6);
}

@media (min-width: 640px) {
  .jobs-preview-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .jobs-preview-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ─── 6. Job Card Architecture ─────────────────────────────────────────── */
.job-card {
  display: flex;
  flex-direction: column;
  background: var(--surface-secondary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-default);
  overflow: hidden;
  transition: transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal);
  position: relative;
  box-shadow: 0 0 0 1px transparent, inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.job-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg), 0 0 0 1px var(--accent-blue), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  border-color: transparent;
}

.job-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-5) var(--spacing-6) var(--spacing-3);
  gap: var(--spacing-2);
}

.job-category-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  background: var(--brand-primary-transparent);
  color: var(--brand-primary);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.job-card-body {
  padding: var(--spacing-3) var(--spacing-6) var(--spacing-5);
  flex: 1;
  display: flex;
  flex-direction: column;
}

.job-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--spacing-2);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.job-description {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: var(--spacing-4);
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Metadata Grid */
.job-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-2) var(--spacing-3);
  padding-top: var(--spacing-3);
  border-top: 1px solid var(--border-default-light);
  margin-top: auto;
}

.job-meta-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.job-meta-item .icon,
.job-meta-item i {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.job-meta-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-budget-value {
  font-weight: 600;
  color: var(--accent-emerald);
}

/* Card Footer & Actions */
.job-card-footer {
  padding: var(--spacing-3) var(--spacing-6);
  background: var(--surface-elevated);
  border-top: 1px solid var(--border-default-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
}

.job-footer-status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--accent-emerald);
}

.job-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.job-actions .btn {
  font-size: var(--text-xs);
  padding: var(--spacing-1) var(--spacing-3);
  border-radius: var(--radius-md);
}

/* ─── 7. Empty State ───────────────────────────────────────────────────── */
#no-jobs-message {
  padding: var(--spacing-12) var(--spacing-6);
  text-align: center;
  margin-top: var(--spacing-4);
}

.empty-state-icon-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
}

.empty-state-icon-wrapper .icon,
.empty-state-icon-wrapper i {
  width: 48px;
  height: 48px;
}

/* ─── 8. Details Modal Styling ─────────────────────────────────────────── */
.job-details-container {
  max-width: 600px;
}

.job-details-body {
  max-height: 70vh;
  overflow-y: auto;
}

.job-details-meta-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}

.details-meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-xs);
  padding: 4px 10px;
  background-color: var(--surface-elevated);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
}

.details-meta-chip .icon,
.details-meta-chip i {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.customer-avatar-box {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--brand-primary-transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.job-details-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
}

/* ─── 9. Responsive Refinements ────────────────────────────────────────── */
@media (max-width: 640px) {
  .job-card-header {
    padding: var(--spacing-4) var(--spacing-4) var(--spacing-2);
  }

  .job-card-body {
    padding: var(--spacing-2) var(--spacing-4) var(--spacing-4);
  }

  .job-meta-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-2);
  }

  .job-card-footer {
    padding: var(--spacing-3) var(--spacing-4);
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-2);
  }

  .job-actions {
    justify-content: stretch;
  }

  .job-actions .btn {
    flex: 1;
  }

  .results-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .sort-control {
    width: 100%;
    justify-content: space-between;
  }
}
```

---

## 6. Zero-Regression & Integration Guarantees

1. **Auth UI & Auth Service Protection**:
   - `js/components/authUI.js` and `js/services/authService.js` remain completely untouched.
   - Header auth elements (`.header-actions .btn-ghost` and `.mobile-menu .btn-outline` with text "Login") match exact selectors needed by `authUI.js` to manage login/logout state dynamically.
2. **Post a Job Button Integration**:
   - `.btn-primary` with text "Post a Job" in both desktop and mobile header is automatically wired by `js/components/modal.js`'s `initModals()`.
3. **Reactive Job Updates**:
   - Newly created jobs dispatched via `document.dispatchEvent(new CustomEvent('job:created'))` will immediately trigger page re-render in `jobs.js`.
4. **Shared Styling Compatibility**:
   - The `.job-card` and `.badge-urgency-*` styles in `css/jobs.css` are written to be cleanly reusable by `index.html` for the "Recent Jobs" preview section (Milestone M3 / `explorer_m3_3`).

---

## 7. Next Steps for Implementation Agents
1. **Worker M3**:
   - Create `jobs.html` at workspace root (`c:\Users\munta\Downloads\blue_collar\jobs.html`).
   - Create `css/jobs.css` at `c:\Users\munta\Downloads\blue_collar\css\jobs.css`.
   - Incorporate `jobs.js` logic and update header links in existing HTML files as guided by peer explorers.
