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
              <label class="input-label" id="job-datetime-label">
                Preferred Date & Time <span class="optional-label">(Optional)</span>
              </label>
              <div class="datetime-row" role="group" aria-labelledby="job-datetime-label">
                <div class="datetime-col datetime-col-date">
                  <div class="input-with-icon">
                    <i data-lucide="calendar" class="input-icon"></i>
                    <input 
                      type="date" 
                      id="job-date" 
                      name="preferredDate" 
                      class="input-field" 
                      aria-label="Preferred date"
                      aria-describedby="job-datetime-error"
                    >
                  </div>
                </div>
                <div class="datetime-col datetime-col-time">
                  <div class="input-with-icon">
                    <i data-lucide="clock" class="input-icon"></i>
                    <input 
                      type="time" 
                      id="job-time" 
                      name="preferredTime" 
                      class="input-field" 
                      aria-label="Preferred time"
                      aria-describedby="job-datetime-error"
                    >
                  </div>
                </div>
                <div class="datetime-col datetime-col-ampm">
                  <div class="select-wrapper">
                    <select 
                      id="job-ampm" 
                      name="ampm" 
                      class="input-field select-field"
                      aria-label="AM or PM"
                    >
                      <option value="AM">AM</option>
                      <option value="PM" selected>PM</option>
                    </select>
                  </div>
                </div>
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
    const selectedDate = new Date(preferredDateVal + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(selectedDate.getTime()) || selectedDate < today) {
      errors.datetime = 'Preferred date cannot be in the past.';
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

  if (typeof window !== 'undefined' && window.lucide) {
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

    const dateVal = (form.preferredDate?.value || '').trim();
    const preferredDate = dateVal || 'Flexible';

    const timeVal = (form.preferredTime?.value || '').trim();
    let preferredTime = 'Flexible';
    if (timeVal) {
      const ampm = document.getElementById('job-ampm')?.value || 'PM';
      const [hoursStr, minutesStr] = timeVal.split(':');
      let h = parseInt(hoursStr, 10);
      
      // Convert to 12-hour format string
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      
      // We will actually just pass it formatted nicely
      // But let's keep it simple and just append AM/PM to whatever the user chose
      // actually, time input is 24h format under the hood "HH:MM"
      let displayH = h % 12 || 12;
      preferredTime = `${displayH}:${minutesStr} ${ampm}`;
    }

    const jobData = {
      title: form.title.value.trim(),
      category: form.category.value,
      description: form.description.value.trim(),
      location: form.location.value.trim(),
      budget: budgetPayload,
      urgency: form.urgency.value,
      preferredDate: preferredDate,
      preferredTime: preferredTime,
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
        if (typeof window !== 'undefined' && window.jobsPageUI?.refreshJobs) {
          window.jobsPageUI.refreshJobs();
        }
      } else {
        // Server validation error (400, 401, 403, 500)
        showBannerError(res?.error || 'Failed to post job. Please verify your details.');
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
  if (typeof document === 'undefined' || !document.body) {
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => initJobModal(), { once: true });
    }
    return;
  }

  // Inject modal markup if not already present
  if (!document.getElementById('post-job-modal')) {
    document.body.insertAdjacentHTML('beforeend', getJobModalHTML());
    if (typeof window !== 'undefined' && window.lucide) {
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
  if (typeof document === 'undefined') return;

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
  if (typeof window !== 'undefined') {
    if (window.authUI?.closeAllAuthModals) {
      window.authUI.closeAllAuthModals();
    }
    if (window.locationUI?.closeModal) {
      window.locationUI.closeModal();
    }
  }

  clearModalErrors();

  // Pre-fill location from localStorage if empty
  const locationInput = document.getElementById('job-location');
  if (locationInput && !locationInput.value && typeof localStorage !== 'undefined') {
    const savedLocation = localStorage.getItem('user-location');
    if (savedLocation && savedLocation !== 'Set Location') {
      locationInput.value = savedLocation;
    }
  }

  // Set minimum date for preferredDate to today
  const dateInput = document.getElementById('job-date');
  if (dateInput) {
    const todayIso = new Date().toISOString().slice(0, 10);
    dateInput.min = todayIso;
  }

  // Double-RAF animation
  if (openRafId && typeof cancelAnimationFrame !== 'undefined') {
    cancelAnimationFrame(openRafId);
    openRafId = null;
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');

  if (document.hidden) {
    modal.classList.add('visible');
  } else if (typeof requestAnimationFrame !== 'undefined') {
    openRafId = requestAnimationFrame(() => {
      modal.classList.add('visible');
      openRafId = null;
    });
  } else {
    modal.classList.add('visible');
  }

  if (document.body) {
    document.body.style.overflow = 'hidden';
  }

  // Re-render Lucide icons
  if (typeof window !== 'undefined' && window.lucide) {
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
  if (typeof document === 'undefined') return;

  const modal = document.getElementById('post-job-modal');
  if (!modal) return;

  if (openRafId && typeof cancelAnimationFrame !== 'undefined') {
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
if (typeof window !== 'undefined') {
  window.jobModalUI = {
    openModal: openJobModal,
    closeModal: closeJobModal,
    init: initJobModal
  };
  window.jobModal = window.jobModalUI;
  window.openJobModal = openJobModal;
}
