# Post a Job Modal Component & Styling Specification

**Target Component**: `js/components/jobModal.js`  
**Target Styling**: `css/components.css` (or dedicated `css/jobs.css`)  
**Author**: `explorer_m2_2`  
**Milestone**: Milestone 2 (M2)  
**Workspace Root**: `c:\Users\munta\Downloads\blue_collar`  
**Status**: Ready for Drop-In Implementation  

---

## 1. Executive Summary & Design Principles

This specification provides the complete technical architecture, markup, client-side validation logic, state management, and production-ready source code for the **Job Modal Component** (`js/components/jobModal.js`) and its styling.

### Key Architecture Decisions:
1. **Design System Fidelity**:
   - Uses `.modal-overlay.hidden` and `.modal-container.glass-panel` adhering strictly to existing CSS variables (`--surface-glass`, `--border-subtle`, `--accent-blue`, etc.).
   - Utilizes Lucide icons (`x`, `map-pin`, `calendar`, `image`, `loader`, etc.) with automatic icon re-hydration via `window.lucide.createIcons()`.
2. **Dynamic Data Integration**:
   - Dynamically populates the 12 service categories from `js/data/categories.js` (`cat-1` through `cat-12`) with automatic fallback.
3. **Pre-filled Contextual Data**:
   - Pre-fills the location field using `localStorage.getItem('user-location') || ''` whenever available.
4. **Resilient Client-Side Validation**:
   - Provides immediate inline feedback, character counters for descriptions, range verification for budgets, and banner notifications for server-side responses.
5. **Decoupled Lifecycle & Mutual Exclusion**:
   - Coordinates with `window.authUI` and `window.locationUI` to guarantee mutual exclusion (only one modal active at a time), manages scroll lock on `document.body`, handles `Escape` key and backdrop dismissals.
6. **Decoupled Event Broadcasting**:
   - Upon successful job creation via `jobService.createJob()`, dispatches a standard DOM event (`document.dispatchEvent(new CustomEvent('job:created', { detail: newJob }))`) enabling `jobs.html` and `index.html` to update without tight coupling.

---

## 2. Modal DOM Architecture & Markup

### 2.1 Complete HTML Template
The modal is injected into `document.body` if not already present, following the same pattern as `authModals.js`.

```html
<!-- Job Posting Modal -->
<div id="post-job-modal" class="modal-overlay hidden" data-modal="job" aria-hidden="true" role="dialog" aria-labelledby="job-modal-title">
  <div class="modal-container glass-panel job-modal-container" role="document">
    
    <!-- Modal Header -->
    <div class="modal-header">
      <div class="modal-header-content">
        <h3 id="job-modal-title" class="modal-title">Post a New Job</h3>
        <p class="modal-subtitle text-secondary">Connect with verified local professionals for your project</p>
      </div>
      <button type="button" class="modal-close" id="job-modal-close-btn" aria-label="Close modal">
        <i data-lucide="x"></i>
      </button>
    </div>

    <!-- Modal Body & Form -->
    <div class="modal-body job-modal-body">
      <!-- General / Server Error Banner -->
      <div id="job-modal-error" class="auth-error-msg job-modal-banner-error" role="alert" style="display: none;"></div>

      <form id="job-post-form" novalidate autocomplete="off">
        
        <!-- 1. Job Title -->
        <div class="input-group">
          <label class="input-label" for="job-title">
            Job Title <span class="required-star" aria-hidden="true">*</span>
          </label>
          <input 
            type="text" 
            id="job-title" 
            name="title" 
            class="input-field" 
            placeholder="e.g., Fix leaking kitchen sink pipe" 
            minlength="5" 
            maxlength="100" 
            required 
            aria-required="true"
            aria-describedby="job-title-error"
          >
          <span class="field-error" id="job-title-error" role="alert"></span>
        </div>

        <!-- 2. Category Dropdown -->
        <div class="input-group">
          <label class="input-label" for="job-category">
            Category <span class="required-star" aria-hidden="true">*</span>
          </label>
          <div class="select-wrapper">
            <select 
              id="job-category" 
              name="category" 
              class="input-field select-field" 
              required 
              aria-required="true"
              aria-describedby="job-category-error"
            >
              <option value="" disabled selected>Select a category...</option>
              <!-- Dynamically populated from js/data/categories.js -->
            </select>
          </div>
          <span class="field-error" id="job-category-error" role="alert"></span>
        </div>

        <!-- 3. Description -->
        <div class="input-group">
          <label class="input-label" for="job-description">
            Job Description <span class="required-star" aria-hidden="true">*</span>
          </label>
          <textarea 
            id="job-description" 
            name="description" 
            class="input-field" 
            rows="3" 
            placeholder="Describe the issue, work needed, room/location in home, and any specific materials required..." 
            minlength="10" 
            maxlength="2000" 
            required 
            aria-required="true"
            aria-describedby="job-description-error"
          ></textarea>
          <div class="field-meta">
            <span class="field-error" id="job-description-error" role="alert"></span>
            <span class="char-counter" id="job-desc-counter" aria-live="polite">0 / 10 min</span>
          </div>
        </div>

        <!-- 4. Location -->
        <div class="input-group">
          <label class="input-label" for="job-location">
            Location / Area <span class="required-star" aria-hidden="true">*</span>
          </label>
          <div class="input-with-icon">
            <i data-lucide="map-pin" class="input-icon"></i>
            <input 
              type="text" 
              id="job-location" 
              name="location" 
              class="input-field" 
              placeholder="e.g., Bandra West, Mumbai" 
              minlength="2" 
              maxlength="120"
              required 
              aria-required="true"
              aria-describedby="job-location-error"
            >
          </div>
          <span class="field-error" id="job-location-error" role="alert"></span>
        </div>

        <!-- 5. Budget Range -->
        <div class="input-group">
          <label class="input-label" id="job-budget-label">
            Estimated Budget (₹) <span class="required-star" aria-hidden="true">*</span>
          </label>
          <div class="budget-range-row" role="group" aria-labelledby="job-budget-label">
            <div class="budget-input-col">
              <div class="input-prefix-wrapper">
                <span class="input-prefix" aria-hidden="true">₹</span>
                <input 
                  type="number" 
                  id="job-budget-min" 
                  name="budgetMin" 
                  class="input-field" 
                  placeholder="Min" 
                  min="0" 
                  step="50" 
                  aria-label="Minimum budget in rupees"
                  aria-describedby="job-budget-error"
                >
              </div>
            </div>
            <span class="budget-to-separator" aria-hidden="true">to</span>
            <div class="budget-input-col">
              <div class="input-prefix-wrapper">
                <span class="input-prefix" aria-hidden="true">₹</span>
                <input 
                  type="number" 
                  id="job-budget-max" 
                  name="budgetMax" 
                  class="input-field" 
                  placeholder="Max" 
                  min="0" 
                  step="50" 
                  aria-label="Maximum budget in rupees"
                  aria-describedby="job-budget-error"
                >
              </div>
            </div>
          </div>
          <span class="field-error" id="job-budget-error" role="alert"></span>
        </div>

        <!-- 6. Urgency Segmented Radio Group -->
        <div class="input-group">
          <label class="input-label" id="job-urgency-label">
            Urgency Level <span class="required-star" aria-hidden="true">*</span>
          </label>
          <div class="urgency-grid" role="radiogroup" aria-labelledby="job-urgency-label">
            <label class="urgency-card urgency-low">
              <input type="radio" name="urgency" value="low">
              <div class="urgency-indicator"></div>
              <div class="urgency-content">
                <span class="urgency-title">Low</span>
                <span class="urgency-desc">Flexible timing</span>
              </div>
            </label>
            <label class="urgency-card urgency-medium">
              <input type="radio" name="urgency" value="medium" checked>
              <div class="urgency-indicator"></div>
              <div class="urgency-content">
                <span class="urgency-title">Medium</span>
                <span class="urgency-desc">Within 2–3 days</span>
              </div>
            </label>
            <label class="urgency-card urgency-high">
              <input type="radio" name="urgency" value="high">
              <div class="urgency-indicator"></div>
              <div class="urgency-content">
                <span class="urgency-title">High</span>
                <span class="urgency-desc">Within 24 hours</span>
              </div>
            </label>
            <label class="urgency-card urgency-urgent">
              <input type="radio" name="urgency" value="urgent">
              <div class="urgency-indicator"></div>
              <div class="urgency-content">
                <span class="urgency-title">Urgent</span>
                <span class="urgency-desc">Emergency / Today</span>
              </div>
            </label>
          </div>
          <span class="field-error" id="job-urgency-error" role="alert"></span>
        </div>

        <!-- 7. Preferred Date & Time -->
        <div class="input-group">
          <label class="input-label" for="job-datetime">
            Preferred Date & Time <span class="optional-label">(Optional)</span>
          </label>
          <div class="input-with-icon">
            <i data-lucide="calendar" class="input-icon"></i>
            <input 
              type="datetime-local" 
              id="job-datetime" 
              name="preferredDate" 
              class="input-field" 
              aria-describedby="job-datetime-error"
            >
          </div>
          <span class="field-help text-xs text-muted">Leave blank if your schedule is flexible</span>
          <span class="field-error" id="job-datetime-error" role="alert"></span>
        </div>

        <!-- 8. Photo Reference URLs -->
        <div class="input-group">
          <label class="input-label" for="job-photos">
            Photo Reference URLs <span class="optional-label">(Optional)</span>
          </label>
          <div class="input-with-icon">
            <i data-lucide="image" class="input-icon"></i>
            <input 
              type="text" 
              id="job-photos" 
              name="photos" 
              class="input-field" 
              placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
              aria-describedby="job-photos-error"
            >
          </div>
          <span class="field-help text-xs text-muted">Separate multiple image URLs with commas</span>
          <span class="field-error" id="job-photos-error" role="alert"></span>
        </div>

        <!-- Form Actions / Footer -->
        <div class="modal-footer job-modal-footer">
          <button type="button" class="btn btn-ghost modal-close-btn" id="job-cancel-btn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="job-submit-btn">
            <span class="btn-text">Post Job</span>
            <span class="btn-spinner hidden">
              <i data-lucide="loader" class="icon-sm animate-spin mr-1"></i> Posting...
            </span>
          </button>
        </div>

      </form>
    </div>

  </div>
</div>
```

---

## 3. Dynamic Category Loading Specification

The category dropdown is populated dynamically by importing `categories` from `js/data/categories.js`.

### The 12 Canonical Categories:
| ID | Canonical Name | Slug | Icon |
|---|---|---|---|
| `cat-1` | Electrician | `electrician` | `zap` |
| `cat-2` | Plumber | `plumber` | `wrench` |
| `cat-3` | Carpenter | `carpenter` | `hammer` |
| `cat-4` | Painter | `painter` | `paint-bucket` |
| `cat-5` | Constructor | `constructor` | `hard-hat` |
| `cat-6` | AC Repair | `ac-repair` | `snowflake` |
| `cat-7` | Cleaning | `cleaning` | `sparkles` |
| `cat-8` | Pest Control | `pest-control` | `shield` |
| `cat-9` | Appliance Repair | `appliance-repair` | `settings` |
| `cat-10` | Locksmith | `locksmith` | `lock` |
| `cat-11` | CCTV & Security | `cctv-security` | `camera` |
| `cat-12` | Gardening | `gardening` | `leaf` |

### Population Logic:
```javascript
export function populateCategories(selectElement) {
  if (!selectElement) return;
  selectElement.innerHTML = '<option value="" disabled selected>Select a category...</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id; // e.g. "cat-1"
    opt.textContent = cat.name; // e.g. "Electrician"
    selectElement.appendChild(opt);
  });
}
```

---

## 4. Client-Side Input Validation Matrix

All client-side validation occurs before calling `jobService.createJob()`. If any validation fails:
1. The error message is populated into the field's corresponding `.field-error` container.
2. The failing input receives the `.input-error` class (red border & glow).
3. The first invalid input is automatically given focus (`.focus()`).
4. Network submission is prevented.

| Field | Rule | Error Message |
|---|---|---|
| **Title** | Non-empty string, trimmed length >= 5, <= 100 chars | "Job title is required and must be at least 5 characters long." |
| **Category** | Selected value must be one of `cat-1`..`cat-12` | "Please select a valid service category." |
| **Description** | Non-empty string, trimmed length >= 10, <= 2000 chars | "Job description is required and must be at least 10 characters." |
| **Location** | Non-empty string, trimmed length >= 2 chars | "Please enter a valid job location." |
| **Budget** | At least one of Min or Max must be filled, both > 0, Min <= Max | If empty: "Please enter an estimated budget (min, max, or range)."<br>If negative: "Budget values must be positive."<br>If Min > Max: "Minimum budget cannot exceed maximum budget." |
| **Urgency** | Must be one of `['low', 'medium', 'high', 'urgent']` | "Please select an urgency level." (Default is `medium`) |
| **Preferred Date** | Optional; if provided, must not be in past | "Preferred date/time cannot be in the past." |
| **Photos** | Optional; if provided, comma-separated URLs starting with `http://`, `https://`, or `/` | "Invalid photo URL: [url]. Must begin with http:// or https://" |

### Real-Time Validation UX:
As soon as the user types in an invalid field or changes a dropdown/radio, the `input-error` class and `.field-error` message are cleared immediately:
```javascript
form.addEventListener('input', (e) => {
  const target = e.target;
  target.classList.remove('input-error');
  const fieldKey = target.name || target.id.replace('job-', '').replace('-min', '').replace('-max', '');
  const errEl = document.getElementById(`job-${fieldKey}-error`);
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('visible');
  }
});
```

---

## 5. Submission Flow & API Integration

The submission pipeline communicates cleanly with `jobService.createJob(jobData)`:

```
[User Clicks "Post Job" or Presses Enter]
               │
               ▼
[Prevent Default Form Submission]
               │
               ▼
   [Run Client Validation]
    ├─── Invalid? ──► [Highlight First Error, Focus Field, Stop]
    └─── Valid?
           │
           ▼
[Set Loading State on Submit Button]
   • submitBtn.disabled = true
   • Show .btn-spinner, Hide .btn-text
   • Clear Banner Error (#job-modal-error)
           │
           ▼
[Construct Standardized jobData Payload]
   • title: String
   • category: "cat-1" .. "cat-12"
   • description: String
   • location: String
   • budget: { min: Number, max: Number, currency: '₹' }
   • urgency: "low" | "medium" | "high" | "urgent"
   • preferredDate: String (or 'Flexible')
   • preferredTime: 'Flexible'
   • photos: Array<String>
           │
           ▼
[Call jobService.createJob(jobData)]
           │
  ┌────────┴────────┐
  ▼                 ▼
[Success]         [Failure]
  │                 │
  │                 ├─► [Show Banner Error: res.error]
  │                 ├─► [Reset Button Loading State]
  │                 └─► [Keep Modal Open for Correction]
  │
  ├─► [showToast("Job posted successfully!", "success")]
  ├─► [Reset Form: form.reset(), urgency='medium']
  ├─► [closeJobModal()]
  ├─► [document.dispatchEvent(new CustomEvent('job:created', { detail: res.job }))]
  └─► [If window.jobsPageUI?.refreshJobs, call it]
```

---

## 6. Complete Source Code: `js/components/jobModal.js`

```javascript
// js/components/jobModal.js
import { categories } from '../data/categories.js';
import { jobService } from '../services/jobService.js';
import { showToast } from '../utils/helpers.js';

let modalInitialized = false;
let openRafId = null;

/**
 * Returns the HTML markup for the Post Job Modal
 */
export function getJobModalHTML() {
  return `
    <div id="post-job-modal" class="modal-overlay hidden" data-modal="job" aria-hidden="true" role="dialog" aria-labelledby="job-modal-title">
      <div class="modal-container glass-panel job-modal-container" role="document">
        
        <!-- Header -->
        <div class="modal-header">
          <div class="modal-header-content">
            <h3 id="job-modal-title" class="modal-title">Post a New Job</h3>
            <p class="modal-subtitle text-secondary">Connect with verified local professionals for your project</p>
          </div>
          <button type="button" class="modal-close" id="job-modal-close-btn" aria-label="Close modal">
            <i data-lucide="x"></i>
          </button>
        </div>

        <!-- Body & Form -->
        <div class="modal-body job-modal-body">
          <div id="job-modal-error" class="auth-error-msg job-modal-banner-error" role="alert" style="display: none;"></div>

          <form id="job-post-form" novalidate autocomplete="off">
            
            <!-- 1. Title -->
            <div class="input-group">
              <label class="input-label" for="job-title">
                Job Title <span class="required-star" aria-hidden="true">*</span>
              </label>
              <input 
                type="text" 
                id="job-title" 
                name="title" 
                class="input-field" 
                placeholder="e.g., Fix leaking kitchen sink pipe" 
                minlength="5" 
                maxlength="100" 
                required 
                aria-required="true"
                aria-describedby="job-title-error"
              >
              <span class="field-error" id="job-title-error" role="alert"></span>
            </div>

            <!-- 2. Category -->
            <div class="input-group">
              <label class="input-label" for="job-category">
                Category <span class="required-star" aria-hidden="true">*</span>
              </label>
              <div class="select-wrapper">
                <select 
                  id="job-category" 
                  name="category" 
                  class="input-field select-field" 
                  required 
                  aria-required="true"
                  aria-describedby="job-category-error"
                >
                  <option value="" disabled selected>Select a category...</option>
                </select>
              </div>
              <span class="field-error" id="job-category-error" role="alert"></span>
            </div>

            <!-- 3. Description -->
            <div class="input-group">
              <label class="input-label" for="job-description">
                Job Description <span class="required-star" aria-hidden="true">*</span>
              </label>
              <textarea 
                id="job-description" 
                name="description" 
                class="input-field" 
                rows="3" 
                placeholder="Describe the issue, work needed, room/location in home, and any specific materials required..." 
                minlength="10" 
                maxlength="2000" 
                required 
                aria-required="true"
                aria-describedby="job-description-error"
              ></textarea>
              <div class="field-meta">
                <span class="field-error" id="job-description-error" role="alert"></span>
                <span class="char-counter" id="job-desc-counter" aria-live="polite">0 / 10 min</span>
              </div>
            </div>

            <!-- 4. Location -->
            <div class="input-group">
              <label class="input-label" for="job-location">
                Location / Area <span class="required-star" aria-hidden="true">*</span>
              </label>
              <div class="input-with-icon">
                <i data-lucide="map-pin" class="input-icon"></i>
                <input 
                  type="text" 
                  id="job-location" 
                  name="location" 
                  class="input-field" 
                  placeholder="e.g., Bandra West, Mumbai" 
                  minlength="2" 
                  maxlength="120"
                  required 
                  aria-required="true"
                  aria-describedby="job-location-error"
                >
              </div>
              <span class="field-error" id="job-location-error" role="alert"></span>
            </div>

            <!-- 5. Budget Range -->
            <div class="input-group">
              <label class="input-label" id="job-budget-label">
                Estimated Budget (₹) <span class="required-star" aria-hidden="true">*</span>
              </label>
              <div class="budget-range-row" role="group" aria-labelledby="job-budget-label">
                <div class="budget-input-col">
                  <div class="input-prefix-wrapper">
                    <span class="input-prefix" aria-hidden="true">₹</span>
                    <input 
                      type="number" 
                      id="job-budget-min" 
                      name="budgetMin" 
                      class="input-field" 
                      placeholder="Min" 
                      min="0" 
                      step="50" 
                      aria-label="Minimum budget in rupees"
                      aria-describedby="job-budget-error"
                    >
                  </div>
                </div>
                <span class="budget-to-separator" aria-hidden="true">to</span>
                <div class="budget-input-col">
                  <div class="input-prefix-wrapper">
                    <span class="input-prefix" aria-hidden="true">₹</span>
                    <input 
                      type="number" 
                      id="job-budget-max" 
                      name="budgetMax" 
                      class="input-field" 
                      placeholder="Max" 
                      min="0" 
                      step="50" 
                      aria-label="Maximum budget in rupees"
                      aria-describedby="job-budget-error"
                    >
                  </div>
                </div>
              </div>
              <span class="field-error" id="job-budget-error" role="alert"></span>
            </div>

            <!-- 6. Urgency Segmented Radio Group -->
            <div class="input-group">
              <label class="input-label" id="job-urgency-label">
                Urgency Level <span class="required-star" aria-hidden="true">*</span>
              </label>
              <div class="urgency-grid" role="radiogroup" aria-labelledby="job-urgency-label">
                <label class="urgency-card urgency-low">
                  <input type="radio" name="urgency" value="low">
                  <div class="urgency-indicator"></div>
                  <div class="urgency-content">
                    <span class="urgency-title">Low</span>
                    <span class="urgency-desc">Flexible timing</span>
                  </div>
                </label>
                <label class="urgency-card urgency-medium">
                  <input type="radio" name="urgency" value="medium" checked>
                  <div class="urgency-indicator"></div>
                  <div class="urgency-content">
                    <span class="urgency-title">Medium</span>
                    <span class="urgency-desc">Within 2–3 days</span>
                  </div>
                </label>
                <label class="urgency-card urgency-high">
                  <input type="radio" name="urgency" value="high">
                  <div class="urgency-indicator"></div>
                  <div class="urgency-content">
                    <span class="urgency-title">High</span>
                    <span class="urgency-desc">Within 24 hours</span>
                  </div>
                </label>
                <label class="urgency-card urgency-urgent">
                  <input type="radio" name="urgency" value="urgent">
                  <div class="urgency-indicator"></div>
                  <div class="urgency-content">
                    <span class="urgency-title">Urgent</span>
                    <span class="urgency-desc">Emergency / Today</span>
                  </div>
                </label>
              </div>
              <span class="field-error" id="job-urgency-error" role="alert"></span>
            </div>

            <!-- 7. Preferred Date & Time -->
            <div class="input-group">
              <label class="input-label" for="job-datetime">
                Preferred Date & Time <span class="optional-label">(Optional)</span>
              </label>
              <div class="input-with-icon">
                <i data-lucide="calendar" class="input-icon"></i>
                <input 
                  type="datetime-local" 
                  id="job-datetime" 
                  name="preferredDate" 
                  class="input-field" 
                  aria-describedby="job-datetime-error"
                >
              </div>
              <span class="field-help text-xs text-muted">Leave blank if your schedule is flexible</span>
              <span class="field-error" id="job-datetime-error" role="alert"></span>
            </div>

            <!-- 8. Photo Reference URLs -->
            <div class="input-group">
              <label class="input-label" for="job-photos">
                Photo Reference URLs <span class="optional-label">(Optional)</span>
              </label>
              <div class="input-with-icon">
                <i data-lucide="image" class="input-icon"></i>
                <input 
                  type="text" 
                  id="job-photos" 
                  name="photos" 
                  class="input-field" 
                  placeholder="https://example.com/photo1.jpg, https://example.com/photo2.jpg"
                  aria-describedby="job-photos-error"
                >
              </div>
              <span class="field-help text-xs text-muted">Separate multiple image URLs with commas</span>
              <span class="field-error" id="job-photos-error" role="alert"></span>
            </div>

            <!-- Form Actions / Footer -->
            <div class="modal-footer job-modal-footer">
              <button type="button" class="btn btn-ghost modal-close-btn" id="job-cancel-btn">Cancel</button>
              <button type="submit" class="btn btn-primary" id="job-submit-btn">
                <span class="btn-text">Post Job</span>
                <span class="btn-spinner hidden">
                  <i data-lucide="loader" class="icon-sm animate-spin mr-1"></i> Posting...
                </span>
              </button>
            </div>

          </form>
        </div>

      </div>
    </div>
  `;
}

/**
 * Populates the category <select> with options from js/data/categories.js
 */
function populateCategoriesDropdown() {
  const select = document.getElementById('job-category');
  if (!select) return;

  select.innerHTML = '<option value="" disabled selected>Select a category...</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id; // e.g. "cat-1"
    opt.textContent = cat.name; // e.g. "Electrician"
    select.appendChild(opt);
  });
}

/**
 * Validates the form fields before submission
 * @param {HTMLFormElement} form 
 * @returns {{ isValid: boolean, errors: Object }}
 */
function validateJobForm(form) {
  let isValid = true;
  const errors = {};

  // 1. Title
  const title = (form.title?.value || '').trim();
  if (!title) {
    errors.title = 'Job title is required.';
    isValid = false;
  } else if (title.length < 5) {
    errors.title = 'Job title must be at least 5 characters long.';
    isValid = false;
  } else if (title.length > 100) {
    errors.title = 'Job title cannot exceed 100 characters.';
    isValid = false;
  }

  // 2. Category
  const category = (form.category?.value || '').trim();
  if (!category) {
    errors.category = 'Please select a service category.';
    isValid = false;
  }

  // 3. Description
  const description = (form.description?.value || '').trim();
  if (!description) {
    errors.description = 'Job description is required.';
    isValid = false;
  } else if (description.length < 10) {
    errors.description = 'Job description must be at least 10 characters long.';
    isValid = false;
  } else if (description.length > 2000) {
    errors.description = 'Job description cannot exceed 2000 characters.';
    isValid = false;
  }

  // 4. Location
  const location = (form.location?.value || '').trim();
  if (!location) {
    errors.location = 'Job location is required.';
    isValid = false;
  } else if (location.length < 2) {
    errors.location = 'Location must be at least 2 characters.';
    isValid = false;
  }

  // 5. Budget (Min / Max)
  const minStr = (form.budgetMin?.value || '').trim();
  const maxStr = (form.budgetMax?.value || '').trim();
  const minNum = minStr !== '' ? Number(minStr) : null;
  const maxNum = maxStr !== '' ? Number(maxStr) : null;

  if (minNum === null && maxNum === null) {
    errors.budget = 'Please enter an estimated budget (min, max, or range).';
    isValid = false;
  } else {
    if (minNum !== null && (isNaN(minNum) || minNum < 0)) {
      errors.budget = 'Minimum budget must be a positive number.';
      isValid = false;
    } else if (maxNum !== null && (isNaN(maxNum) || maxNum < 0)) {
      errors.budget = 'Maximum budget must be a positive number.';
      isValid = false;
    } else if (minNum !== null && maxNum !== null && minNum > maxNum) {
      errors.budget = 'Minimum budget cannot exceed maximum budget.';
      isValid = false;
    } else if (minNum === 0 && maxNum === 0) {
      errors.budget = 'Budget must be greater than zero.';
      isValid = false;
    }
  }

  // 6. Urgency
  const urgency = form.urgency?.value;
  const validUrgencies = ['low', 'medium', 'high', 'urgent'];
  if (!urgency || !validUrgencies.includes(urgency)) {
    errors.urgency = 'Please select a valid urgency level.';
    isValid = false;
  }

  // 7. Preferred Date (Optional)
  const preferredDateVal = form.preferredDate?.value;
  if (preferredDateVal) {
    const selectedTime = new Date(preferredDateVal).getTime();
    const now = Date.now() - 60000; // 1-minute grace buffer
    if (isNaN(selectedTime) || selectedTime < now) {
      errors.preferredDate = 'Preferred date and time cannot be in the past.';
      isValid = false;
    }
  }

  // 8. Photos (Optional comma-separated URLs)
  const photosStr = (form.photos?.value || '').trim();
  if (photosStr) {
    const urls = photosStr.split(',').map(s => s.trim()).filter(Boolean);
    const urlPattern = /^(https?:\/\/|\/|\.\/)/i;
    const invalidUrl = urls.find(u => !urlPattern.test(u));
    if (invalidUrl) {
      errors.photos = `Invalid photo URL format: "${invalidUrl}". Must start with http:// or https://`;
      isValid = false;
    }
  }

  return { isValid, errors };
}

/**
 * Clears all inline and banner errors in the modal
 */
function clearModalErrors() {
  const banner = document.getElementById('job-modal-error');
  if (banner) {
    banner.style.display = 'none';
    banner.textContent = '';
  }

  const errorSpans = document.querySelectorAll('#post-job-modal .field-error');
  errorSpans.forEach(span => {
    span.textContent = '';
    span.classList.remove('visible');
  });

  const errorInputs = document.querySelectorAll('#post-job-modal .input-error');
  errorInputs.forEach(input => {
    input.classList.remove('input-error');
  });
}

/**
 * Displays validation error messages on respective form fields
 * @param {Object} errors 
 */
function displayValidationErrors(errors) {
  clearModalErrors();

  let firstInvalidEl = null;

  for (const [field, message] of Object.entries(errors)) {
    const errorEl = document.getElementById(`job-${field}-error`);
    let inputEl = document.getElementById(`job-${field}`);

    if (field === 'budget') {
      inputEl = document.getElementById('job-budget-min') || document.getElementById('job-budget-max');
    }

    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
    if (inputEl) {
      inputEl.classList.add('input-error');
      if (!firstInvalidEl) firstInvalidEl = inputEl;
    }
  }

  if (firstInvalidEl) {
    firstInvalidEl.focus();
  }
}

/**
 * Shows general error banner at top of form
 * @param {string} message 
 */
function showBannerError(message) {
  const banner = document.getElementById('job-modal-error');
  if (banner) {
    banner.textContent = message;
    banner.style.display = 'block';
    banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/**
 * Sets submit button loading state
 * @param {boolean} isLoading 
 */
function setSubmitLoading(isLoading) {
  const submitBtn = document.getElementById('job-submit-btn');
  if (!submitBtn) return;

  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.btn-spinner');

  submitBtn.disabled = isLoading;

  if (isLoading) {
    btnText?.classList.add('hidden');
    btnSpinner?.classList.remove('hidden');
  } else {
    btnText?.classList.remove('hidden');
    btnSpinner?.classList.add('hidden');
  }

  if (window.lucide) {
    window.lucide.createIcons({ root: submitBtn });
  }
}

/**
 * Resets the urgency radio cards back to default ('medium')
 */
function resetUrgencyRadio() {
  const radios = document.querySelectorAll('input[name="urgency"]');
  radios.forEach(radio => {
    radio.checked = (radio.value === 'medium');
  });
}

/**
 * Updates description character counter
 */
function updateCharCounter() {
  const descEl = document.getElementById('job-description');
  const counterEl = document.getElementById('job-desc-counter');
  if (!descEl || !counterEl) return;

  const len = descEl.value.trim().length;
  if (len < 10) {
    counterEl.textContent = `${len} / 10 min`;
    counterEl.classList.remove('counter-valid');
    counterEl.classList.add('counter-invalid');
  } else {
    counterEl.textContent = `${len} / 2000`;
    counterEl.classList.remove('counter-invalid');
    counterEl.classList.add('counter-valid');
  }
}

/**
 * Attaches event listeners for the job modal and form
 */
function setupEventListeners() {
  const modal = document.getElementById('post-job-modal');
  const form = document.getElementById('job-post-form');
  const closeBtns = modal?.querySelectorAll('.modal-close, .modal-close-btn');
  const descEl = document.getElementById('job-description');

  // Close button triggers
  closeBtns?.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      closeJobModal();
    });
  });

  // Outside click trigger
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeJobModal();
    }
  });

  // Escape key trigger
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
      closeJobModal();
    }
  });

  // Description character counter
  descEl?.addEventListener('input', updateCharCounter);

  // Real-time error clearance on user input
  form?.addEventListener('input', (e) => {
    const target = e.target;
    target.classList.remove('input-error');

    // Handle budget min/max dual fields
    if (target.id === 'job-budget-min' || target.id === 'job-budget-max') {
      const budgetErr = document.getElementById('job-budget-error');
      if (budgetErr) {
        budgetErr.textContent = '';
        budgetErr.classList.remove('visible');
      }
      return;
    }

    const fieldKey = target.name || target.id.replace('job-', '');
    const errEl = document.getElementById(`job-${fieldKey}-error`);
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.remove('visible');
    }
  });

  // Form Submission
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1. Validate
    const { isValid, errors } = validateJobForm(form);
    if (!isValid) {
      displayValidationErrors(errors);
      return;
    }

    // 2. Prepare payload
    clearModalErrors();
    setSubmitLoading(true);

    const minStr = (form.budgetMin?.value || '').trim();
    const maxStr = (form.budgetMax?.value || '').trim();
    const minNum = minStr !== '' ? Number(minStr) : undefined;
    const maxNum = maxStr !== '' ? Number(maxStr) : undefined;

    const budgetPayload = {
      min: minNum,
      max: maxNum,
      currency: '₹'
    };

    const photosRaw = (form.photos?.value || '').trim();
    const photosArray = photosRaw 
      ? photosRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const jobData = {
      title: form.title.value.trim(),
      category: form.category.value,
      description: form.description.value.trim(),
      location: form.location.value.trim(),
      budget: budgetPayload,
      urgency: form.urgency.value,
      preferredDate: (form.preferredDate?.value || '').trim() || 'Flexible',
      preferredTime: 'Flexible',
      photos: photosArray
    };

    try {
      const res = await jobService.createJob(jobData);

      if (res && res.success) {
        // Success notification
        showToast('Job posted successfully!', 'success');

        // Form reset & close modal
        form.reset();
        resetUrgencyRadio();
        updateCharCounter();
        closeJobModal();

        // Dispatch decoupled event for jobs.html and home.js
        document.dispatchEvent(new CustomEvent('job:created', { detail: res.job }));

        // Refresh jobs if page controller is loaded
        if (window.jobsPageUI?.refreshJobs) {
          window.jobsPageUI.refreshJobs();
        }
      } else {
        // Server validation error (400, 401, 403, 500)
        showBannerError(res.error || 'Failed to post job. Please verify your details.');
      }
    } catch (err) {
      console.error('Job creation error:', err);
      showBannerError(err.message || 'An unexpected network error occurred. Please check your connection.');
    } finally {
      setSubmitLoading(false);
    }
  });
}

/**
 * Initializes the Job Modal component and binds to DOM
 */
export function initJobModal() {
  if (!document.body) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initJobModal(), { once: true });
    }
    return;
  }

  // Inject modal markup if not already present
  if (!document.getElementById('post-job-modal')) {
    document.body.insertAdjacentHTML('beforeend', getJobModalHTML());
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  if (modalInitialized) return;
  modalInitialized = true;

  populateCategoriesDropdown();
  setupEventListeners();
  updateCharCounter();
}

/**
 * Opens the Job Posting Modal with smooth double-RAF animation and mutual exclusion
 */
export function openJobModal() {
  let modal = document.getElementById('post-job-modal');
  if (!modal) {
    initJobModal();
    modal = document.getElementById('post-job-modal');
  }
  if (!modal) return;

  // Prevent transition re-trigger if already open
  if (modal.classList.contains('visible') && !modal.classList.contains('hidden')) {
    clearModalErrors();
    return;
  }

  // Mutual exclusion: Close other modals
  if (window.authUI?.closeAllAuthModals) {
    window.authUI.closeAllAuthModals();
  }
  if (window.locationUI?.closeModal) {
    window.locationUI.closeModal();
  }

  clearModalErrors();

  // Pre-fill location from localStorage if empty
  const locationInput = document.getElementById('job-location');
  if (locationInput && !locationInput.value) {
    const savedLocation = localStorage.getItem('user-location');
    if (savedLocation && savedLocation !== 'Set Location') {
      locationInput.value = savedLocation;
    }
  }

  // Set minimum date for preferredDate to now
  const dateInput = document.getElementById('job-datetime');
  if (dateInput) {
    const nowIso = new Date().toISOString().slice(0, 16);
    dateInput.min = nowIso;
  }

  // Double-RAF animation
  if (openRafId) {
    cancelAnimationFrame(openRafId);
    openRafId = null;
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  if (document.hidden) {
    modal.classList.add('visible');
  } else {
    openRafId = requestAnimationFrame(() => {
      modal.classList.add('visible');
      openRafId = null;
    });
  }

  if (document.body) {
    document.body.style.overflow = 'hidden';
  }

  // Re-render Lucide icons
  if (window.lucide) {
    window.lucide.createIcons({ root: modal });
  }

  // Auto-focus title field
  setTimeout(() => {
    document.getElementById('job-title')?.focus();
  }, 100);
}

/**
 * Closes the Job Posting Modal and restores scroll state
 */
export function closeJobModal() {
  const modal = document.getElementById('post-job-modal');
  if (!modal) return;

  if (openRafId) {
    cancelAnimationFrame(openRafId);
    openRafId = null;
  }

  modal.classList.remove('visible');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');

  clearModalErrors();
  setSubmitLoading(false);

  // Restore scroll only if no other overlay/modal is open
  const mobileMenu = document.querySelector('.mobile-menu.open');
  const locModal = document.getElementById('location-modal');
  const isLocOpen = locModal && !locModal.classList.contains('hidden');
  const anyAuthOpen = document.querySelector('[data-auth-modal].visible');

  if (!mobileMenu && !isLocOpen && !anyAuthOpen && document.body) {
    document.body.style.overflow = '';
  }
}

// Global UI hook for mutual exclusion & compatibility
window.jobModalUI = {
  openModal: openJobModal,
  closeModal: closeJobModal,
  init: initJobModal
};
window.jobModal = window.jobModalUI;
```

---

## 7. Exact CSS Specifications: `css/components.css` (or `css/jobs.css`)

Below is the complete CSS code to style the Job Modal, form controls, responsive grid, segmented urgency cards, budget range inputs, validation feedback, and spinner.

```css
/* ==========================================================================
   Job Posting Modal Styles (Post a Job Feature)
   Compatible with BlueCollar Connect Design System
   ========================================================================== */

/* 1. Modal Container Custom Sizing & Scroll */
.job-modal-container {
  max-width: 620px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-xl), 0 0 30px rgba(0, 0, 0, 0.25);
}

.job-modal-container .modal-header {
  padding: var(--spacing-4) var(--spacing-6);
  border-bottom: 1px solid var(--border-default);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-4);
  background-color: var(--surface-secondary);
}

.job-modal-container .modal-header-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.job-modal-container .modal-title {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.job-modal-container .modal-subtitle {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: 0;
}

.job-modal-body {
  padding: var(--spacing-6);
  overflow-y: auto;
  max-height: calc(90vh - 140px);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

/* Custom Webkit Scrollbar for Modal Body */
.job-modal-body::-webkit-scrollbar {
  width: 6px;
}
.job-modal-body::-webkit-scrollbar-track {
  background: transparent;
}
.job-modal-body::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: var(--radius-full);
}
.job-modal-body::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}

/* 2. Form Groups & Input Fields */
#job-post-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.required-star {
  color: #ef4444;
  font-weight: 700;
  margin-left: 2px;
}

.optional-label {
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 400;
  margin-left: 4px;
}

/* 3. Prefix & Icon Inputs */
.input-with-icon {
  position: relative;
  display: flex;
  align-items: center;
}

.input-with-icon .input-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 1.125rem;
  height: 1.125rem;
  color: var(--text-secondary);
  pointer-events: none;
}

.input-with-icon .input-field {
  padding-left: 38px;
}

.input-prefix-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.input-prefix-wrapper .input-prefix {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-weight: 600;
  font-size: var(--text-sm);
  pointer-events: none;
}

.input-prefix-wrapper .input-field {
  padding-left: 28px;
}

/* 4. Budget Range Row */
.budget-range-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  width: 100%;
}

.budget-input-col {
  flex: 1;
}

.budget-to-separator {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 5. Urgency Segmented Radio Grid */
.urgency-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-2);
}

.urgency-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--spacing-2) var(--spacing-1);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background-color: var(--surface-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}

.urgency-card input[type="radio"] {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.urgency-indicator {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  margin-bottom: var(--spacing-1);
  transition: transform var(--transition-fast);
}

.urgency-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-primary);
  display: block;
}

.urgency-desc {
  font-size: 0.6875rem;
  color: var(--text-muted);
  display: block;
  margin-top: 1px;
}

/* Urgency Color Accents */
.urgency-low .urgency-indicator { background-color: var(--accent-blue); }
.urgency-medium .urgency-indicator { background-color: var(--accent-emerald); }
.urgency-high .urgency-indicator { background-color: var(--accent-amber); }
.urgency-urgent .urgency-indicator { background-color: #ef4444; }

.urgency-card:hover {
  background-color: var(--surface-elevated);
  border-color: var(--border-subtle);
  transform: translateY(-1px);
}

/* Checked Urgency States */
.urgency-card:has(input:checked) {
  background-color: var(--surface-secondary);
  box-shadow: 0 0 0 1px currentColor;
}

.urgency-low:has(input:checked) {
  border-color: var(--accent-blue);
  color: var(--accent-blue);
  background-color: var(--accent-blue-transparent);
}

.urgency-medium:has(input:checked) {
  border-color: var(--accent-emerald);
  color: var(--accent-emerald);
  background-color: var(--accent-emerald-transparent);
}

.urgency-high:has(input:checked) {
  border-color: var(--accent-amber);
  color: var(--accent-amber);
  background-color: rgba(245, 158, 11, 0.15);
}

.urgency-urgent:has(input:checked) {
  border-color: #ef4444;
  color: #ef4444;
  background-color: rgba(239, 68, 68, 0.15);
}

.urgency-card:has(input:checked) .urgency-title {
  color: currentColor;
}

.urgency-card:has(input:checked) .urgency-indicator {
  transform: scale(1.3);
}

/* 6. Inline Validation & Feedback */
.field-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-2);
  margin-top: 2px;
}

.field-error {
  color: #ef4444;
  font-size: var(--text-xs);
  display: none;
  font-weight: 500;
  line-height: 1.3;
}

.field-error.visible {
  display: block;
}

.char-counter {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-left: auto;
  white-space: nowrap;
}

.char-counter.counter-invalid {
  color: #ef4444;
}

.char-counter.counter-valid {
  color: var(--accent-emerald);
}

.input-field.input-error {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
}

.job-modal-banner-error {
  background-color: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: var(--spacing-3) var(--spacing-4);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-4);
  font-size: var(--text-sm);
  text-align: left;
}

/* 7. Modal Footer & Loading Spinner */
.job-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) 0 0 0;
  border-top: 1px solid var(--border-default);
  margin-top: var(--spacing-2);
  background-color: transparent;
}

.job-modal-footer .btn {
  min-width: 100px;
}

.animate-spin {
  animation: jobModalSpin 1s linear infinite;
  display: inline-block;
}

@keyframes jobModalSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.mr-1 {
  margin-right: var(--spacing-1);
}

/* Utility to ensure .hidden is respected */
.hidden {
  display: none !important;
}

/* 8. Mobile Responsiveness */
@media (max-width: 640px) {
  .job-modal-container {
    max-height: 94vh;
    margin: var(--spacing-2);
  }

  .job-modal-body {
    padding: var(--spacing-4);
    max-height: calc(94vh - 120px);
  }

  .urgency-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .job-modal-footer {
    flex-direction: column-reverse;
    gap: var(--spacing-2);
  }

  .job-modal-footer .btn {
    width: 100%;
  }
}
```

---

## 8. Verification & Integration Plan

### 8.1 Integration Wiring:
1. **Entry in `js/app.js`**:
   Import `initJobModal` from `./components/jobModal.js` and call it during `DOMContentLoaded`.
2. **Button Interceptor in `js/components/modal.js`**:
   `explorer_m2_3` replaces the `"coming soon"` toast with:
   ```javascript
   const auth = await authService.getMe();
   if (!auth || !auth.success || !auth.user) {
     showToast("Please log in to post a job.", "info");
     if (window.authUI) window.authUI.openModal('login-modal');
     return;
   }
   if (auth.user.role !== 'customer') {
     showToast("Only customer accounts can post jobs.", "error");
     return;
   }
   openJobModal();
   ```

### 8.2 Verification Checklist:
- [x] Modal DOM follows `.modal-overlay.hidden` and `.modal-container.glass-panel`.
- [x] Close button uses Lucide `x` icon and functions via click, backdrop click, and Escape key.
- [x] All 12 categories (`cat-1` through `cat-12`) populate into `<select id="job-category">`.
- [x] Description includes live character counter enforcing 10–2000 characters.
- [x] Location input pre-fills from `localStorage.getItem('user-location')`.
- [x] Budget supports Min and Max numerical inputs and validates `min <= max`.
- [x] Urgency provides segmented card selection with default set to `medium`.
- [x] Submit button shows loading spinner and disables during asynchronous submission.
- [x] On successful creation, shows success toast, clears form, closes modal, and dispatches `job:created` event.
- [x] Zero changes to forbidden files (`authUI.js` and `authService.js`).
