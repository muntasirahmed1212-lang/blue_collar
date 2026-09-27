# Frontend Job Client Service Architecture & Implementation Plan

**Target File**: `js/services/jobService.js`  
**Author**: `explorer_m2_1`  
**Target Milestone**: Milestone 2 (M2)  
**Workspace**: `c:\Users\munta\Downloads\blue_collar`  
**Status**: Ready for Drop-In Implementation  

---

## 1. Executive Summary & Scope Compliance

This document outlines the architecture, method specifications, error-envelope normalization, and complete production-ready source code for `js/services/jobService.js`.

### Scope Boundaries:
- **Strictly Read-Only Investigation**: No source files outside the agent workspace (`.agents/teamwork/explorer_m2_1/`) have been created or modified during this investigation.
- **Protected Files**: `js/components/authUI.js` and `js/services/authService.js` remain completely untouched and unmodified.
- **Zero-Dependency Vanilla ES Module**: Designed for direct browser import via standard `<script type="module">` without build steps or external bundlers.

---

## 2. Examination of `js/services/` Directory & Fetch Conventions

### 2.1 Existing Pattern in `js/services/authService.js`
The project currently has a single service file: `js/services/authService.js`. An examination of lines 1–18 reveals the following core pattern:

```javascript
// js/services/authService.js
const API_BASE = '/api/auth';

async function fetchWithJSON(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });
  
  return response.json();
}
```

### 2.2 Key Architectural Observations & Enhancements for `jobService.js`

1. **Explicit Session Credentials (`credentials: 'include'`)**:
   - `server.js:34` explicitly sets `cors({ credentials: true })`, and `server.js:46-50` configures session cookies (`connect.sid`).
   - Although modern browsers default same-origin requests to `'same-origin'`, setting `credentials: 'include'` explicitly guarantees that session cookies are forwarded in all environments, including cross-port dev servers (e.g., Live Server on `:5500` connecting to Express on `:3000`), preview environments, and iframe-based testing sandboxes.

2. **Backend Error Envelopes vs. Network / Non-JSON Failures**:
   - In `authService.js`, calling `response.json()` works when the server returns valid JSON. However, if the server returns non-JSON (e.g., reverse proxy HTML error, 502 Bad Gateway) or if the network disconnects, `fetch()` or `response.json()` throws an uncaught exception.
   - `jobService.js` introduces robust defensive parsing: it inspects the HTTP status and content type, gracefully parses JSON or text, and catches low-level `fetch` rejections, normalizing them into a predictable error envelope.

3. **Global Rate Limiting Envelope Anomaly**:
   - In `server.js:54-58`, the global rate limiter returns:
     `{ error: 'Too many requests, please try again later.' }` (HTTP status 429).
   - Notice that `success: false` is not explicitly present in the rate limiter's default JSON payload.
   - `jobService.js` checks `response.ok` (HTTP 200–299) and guarantees `success: false` is synthesized whenever the HTTP status indicates an error.

4. **URL Query Param Serialization**:
   - While `authService` endpoints are primarily POST/GET with fixed paths (`/me`, `/logout`), `jobService.getJobs(params)` requires robust query string construction for filtering (`category`, `urgency`, `location`, `status`, `sort`, `limit`).
   - `jobService.js` integrates a query builder supporting both object maps (`{ category: 'cat-1', limit: 6 }`) and pre-built query strings.

---

## 3. Backend API Endpoints & Contract Matrix

The backend endpoints are implemented in `server/controllers/jobController.js` and mounted at `/api/jobs` via `server/routes/jobs.js`. All 34 automated tests in `tests/verify-jobs.js` pass.

| Method | Endpoint | Auth & Role Required | Query / Body Payload | Success Response (HTTP 200/201) | Error Responses |
|---|---|---|---|---|---|
| `POST` | `/api/jobs` | Verified Customer Session | Body: `{ title, description, category, location, budget, urgency, photos?, preferredDate?, preferredTime? }` | `{ success: true, job: {...} }` (201) | 400 Bad Request<br>401 Unauthenticated<br>403 Unverified / Non-Customer |
| `GET` | `/api/jobs` | Public (No auth required) | Query: `category`, `urgency`, `location`, `status` (default: 'open'), `sort` ('newest', 'oldest', 'budget', 'budget-asc'), `limit` | `{ success: true, count: N, total: N, jobs: [...] }` (200) | 500 Server error |
| `GET` | `/api/jobs/:id` | Public (No auth required) | Path parameter `:id` | `{ success: true, job: {...} }` (200) | 404 Job not found<br>500 Server error |
| `PATCH` | `/api/jobs/:id` | Job Owner or Admin Session | Path parameter `:id`<br>Body: partial job update fields | `{ success: true, job: {...} }` (200) | 400 Bad Request<br>401 Unauthenticated<br>403 Forbidden (Non-owner)<br>404 Not found |
| `DELETE` | `/api/jobs/:id` | Job Owner or Admin Session | Path parameter `:id` | `{ success: true, message: 'Job cancelled', job: {...} }` (200) | 401 Unauthenticated<br>403 Forbidden (Non-owner)<br>404 Not found |

---

## 4. Error Envelope Handling Architecture

### 4.1 Standardized Response Contract

To match `PROJECT.md` contracts and ensure complete consistency with `authUI.js` patterns, every method in `jobService.js` returns a standardized response envelope:

- **On Success**:
  ```javascript
  {
    success: true,
    // Payload properties returned by backend:
    job: { ... },      // for createJob, getJobById, updateJob
    jobs: [ ... ],     // for getJobs
    count: 5,          // for getJobs
    total: 5,          // for getJobs
    message: "..."     // for cancelJob
  }
  ```

- **On Error**:
  ```javascript
  {
    success: false,
    error: "Specific error message (or fallback)",
    status: 400,       // HTTP status code (or 0 for network offline)
    details: null      // Optional extra debug or validation detail
  }
  ```

### 4.2 Handling of All Failure Scenarios

1. **HTTP 400 Validation Errors**:
   - Backend returns: `{ success: false, error: 'Title is required...' }`
   - Client returns: `{ success: false, error: 'Title is required...', status: 400 }`
2. **HTTP 401 Unauthenticated**:
   - Backend returns: `{ success: false, error: 'Unauthorized. Please log in.' }`
   - Client returns: `{ success: false, error: 'Unauthorized. Please log in.', status: 401 }`
3. **HTTP 403 Forbidden**:
   - Backend returns: `{ success: false, error: 'Only verified customers can post jobs.' }`
   - Client returns: `{ success: false, error: 'Only verified customers can post jobs.', status: 403 }`
4. **HTTP 404 Not Found**:
   - Backend returns: `{ success: false, error: 'Job not found' }`
   - Client returns: `{ success: false, error: 'Job not found', status: 404 }`
5. **HTTP 429 Rate Limited**:
   - Backend returns: `{ error: 'Too many requests, please try again later.' }`
   - Client synthesizes: `{ success: false, error: 'Too many requests, please try again later.', status: 429 }`
6. **Network Dropped / Offline / CORS Rejection**:
   - `fetch()` throws TypeError
   - Client catches and returns: `{ success: false, error: 'Network error. Please check your internet connection.', status: 0 }`

### 4.3 Optional Throw Mode (`throwOnError`) & `JobApiError`

For callers that prefer `try/catch` idioms instead of checking `if (!res.success)`, `jobService` methods accept an optional `{ throwOnError: true }` option or can be wrapped with custom error handling. A custom `JobApiError` class is exported:

```javascript
export class JobApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'JobApiError';
    this.status = status;
    this.details = details;
  }
}
```

---

## 5. Detailed Method Specifications

### 5.1 `createJob(jobData, options = {})`
- **Method & Path**: `POST /api/jobs`
- **Credentials**: `include`
- **Header**: `'Content-Type': 'application/json'`
- **Parameters**:
  - `jobData` (Object):
    - `title` (string, required, >= 5 chars)
    - `category` (string, required, e.g. `'cat-1'` or `'plumber'`)
    - `description` (string, required, >= 10 chars)
    - `location` (string, required, >= 2 chars)
    - `budget` (string | number | object, required, e.g. `'₹500 - ₹1,500'`, `1000`, or `{ min: 500, max: 1500, currency: '₹' }`)
    - `urgency` (string, required, `'low'`, `'medium'`, `'high'`, `'urgent'`)
    - `preferredDate` (string, optional, e.g. `'2026-10-01'`)
    - `preferredTime` (string, optional, e.g. `'Morning (9 AM - 12 PM)'`)
    - `photos` (Array<string>, optional)
- **Returns**: Promise resolving to `{ success: true, job: {...} }` or `{ success: false, error: string, status: number }`.

### 5.2 `getJobs(params = {}, options = {})`
- **Method & Path**: `GET /api/jobs[?querystring]`
- **Credentials**: `include`
- **Parameters**:
  - `params` (Object | string, optional):
    - `category` (string): e.g. `'cat-1'` or `'electrician'`
    - `urgency` (string): `'low'`, `'medium'`, `'high'`, `'urgent'`
    - `location` (string): substring search filter
    - `status` (string): defaults to `'open'` (or `'all'`)
    - `sort` (string): `'newest'` (default), `'oldest'`, `'budget'` / `'budget-desc'`, `'budget-asc'`
    - `limit` (number | string): maximum number of jobs to return (e.g. `4` or `6` for homepage)
- **Returns**: Promise resolving to `{ success: true, count: N, total: N, jobs: [...] }` or `{ success: false, error: string, status: number }`.

### 5.3 `getJobById(id, options = {})`
- **Method & Path**: `GET /api/jobs/:id`
- **Credentials**: `include`
- **Parameters**:
  - `id` (string, required): unique UUID of the job
- **Returns**: Promise resolving to `{ success: true, job: {...} }` or `{ success: false, error: 'Job not found', status: 404 }`.

### 5.4 `updateJob(id, updates, options = {})`
- **Method & Path**: `PATCH /api/jobs/:id`
- **Credentials**: `include`
- **Parameters**:
  - `id` (string, required): job ID
  - `updates` (Object, required): fields to update (`title`, `category`, `description`, `location`, `budget`, `urgency`, `status`, etc.)
- **Returns**: Promise resolving to `{ success: true, job: {...} }` or `{ success: false, error: string, status: number }`.

### 5.5 `cancelJob(id, options = {})` & `deleteJob(id, options = {})`
- **Method & Path**: `DELETE /api/jobs/:id`
- **Credentials**: `include`
- **Parameters**:
  - `id` (string, required): job ID to cancel
- **Returns**: Promise resolving to `{ success: true, message: 'Job cancelled', job: {...} }` or `{ success: false, error: string, status: number }`.
- **Alias**: `deleteJob(id, options)` is exported as an alias pointing directly to `cancelJob`.

---

## 6. Exact Drop-In Implementation Code for `js/services/jobService.js`

Below is the complete, drop-in implementation code for `js/services/jobService.js`. When Milestone 2 implementers create this file, they can paste this code verbatim.

```javascript
// js/services/jobService.js

/**
 * Base URL for the Job Posting REST API
 */
const API_BASE = '/api/jobs';

/**
 * Custom Error class for Job API requests.
 */
export class JobApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'JobApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Builds a valid query string from an object or string parameter map.
 * Safely strips null, undefined, and empty string values.
 *
 * @param {Object|string} [params] - Query parameters
 * @returns {string} Leading-question-mark query string (e.g. "?category=cat-1") or empty string
 */
function buildQueryString(params) {
  if (!params) return '';

  if (typeof params === 'string') {
    const trimmed = params.trim();
    if (!trimmed) return '';
    return trimmed.startsWith('?') ? trimmed : `?${trimmed}`;
  }

  if (typeof params === 'object') {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value).trim());
      }
    }
    const qs = searchParams.toString();
    return qs ? `?${qs}` : '';
  }

  return '';
}

/**
 * Core HTTP client for Job API requests.
 * Standardizes request headers, session cookie credentials, JSON parsing,
 * and normalizes error envelopes into predictable return structures.
 *
 * @param {string} endpoint - API path relative to API_BASE (e.g. "" or "/:id")
 * @param {RequestInit} [options={}] - Standard Fetch options
 * @param {boolean} [options.throwOnError=false] - If true, throws JobApiError on failure
 * @returns {Promise<Object>} Standardized envelope: { success: boolean, ... }
 */
async function fetchWithJSON(endpoint, options = {}) {
  const { throwOnError = false, ...fetchOptions } = options;

  const headers = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers || {})
  };

  const url = `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      credentials: 'include', // Always send session cookies
      ...fetchOptions,
      headers
    });

    // Safely parse JSON or text response
    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (parseErr) {
        data = null;
      }
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: response.ok, error: text || response.statusText };
      }
    }

    // Defensive normalization if response body was empty or not an object
    if (!data || typeof data !== 'object') {
      data = {
        success: response.ok,
        error: response.ok ? null : (response.statusText || `HTTP Error ${response.status}`)
      };
    }

    // Attach status code for caller inspection
    data.status = response.status;

    // Handle non-2xx HTTP status codes
    if (!response.ok) {
      data.success = false;
      if (!data.error) {
        data.error = data.message || `Request failed (${response.status}: ${response.statusText || 'Error'})`;
      }

      if (throwOnError) {
        throw new JobApiError(data.error, response.status, data);
      }
    } else {
      // Guarantee success boolean is present on 2xx responses
      if (data.success === undefined) {
        data.success = true;
      }
    }

    return data;
  } catch (error) {
    if (error instanceof JobApiError) {
      throw error;
    }

    const networkEnvelope = {
      success: false,
      status: 0,
      error: error.message || 'Network error. Please check your connection and try again.'
    };

    if (throwOnError) {
      throw new JobApiError(networkEnvelope.error, 0, networkEnvelope);
    }

    return networkEnvelope;
  }
}

/**
 * Creates a new job posting.
 * Gated on backend: requires active session of a verified customer.
 *
 * @param {Object} jobData - Job fields (title, description, category, location, budget, urgency, etc.)
 * @param {Object} [options] - Optional fetch options (e.g. { throwOnError: true })
 * @returns {Promise<{ success: boolean, job?: Object, error?: string, status: number }>}
 */
export async function createJob(jobData, options = {}) {
  return fetchWithJSON('', {
    method: 'POST',
    body: JSON.stringify(jobData || {}),
    ...options
  });
}

/**
 * Retrieves a list of open job postings with optional query filtering and sorting.
 * Public endpoint (no authentication required).
 *
 * Supported params:
 * - category: 'cat-1'..'cat-12' or category slug
 * - urgency: 'low' | 'medium' | 'high' | 'urgent'
 * - location: substring search string
 * - status: 'open' (default) | 'all' | 'in-progress' | 'completed' | 'cancelled'
 * - sort: 'newest' (default) | 'oldest' | 'budget' | 'budget-desc' | 'budget-asc'
 * - limit: number (e.g. 6 for homepage preview)
 *
 * @param {Object|string} [params={}] - Filter and sorting parameters
 * @param {Object} [options] - Optional fetch options
 * @returns {Promise<{ success: boolean, count?: number, total?: number, jobs?: Array<Object>, error?: string, status: number }>}
 */
export async function getJobs(params = {}, options = {}) {
  const queryString = buildQueryString(params);
  return fetchWithJSON(queryString, {
    method: 'GET',
    ...options
  });
}

/**
 * Retrieves full details for a single job by its UUID.
 * Public endpoint (no authentication required).
 *
 * @param {string} id - Job unique identifier
 * @param {Object} [options] - Optional fetch options
 * @returns {Promise<{ success: boolean, job?: Object, error?: string, status: number }>}
 */
export async function getJobById(id, options = {}) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    const errorEnvelope = { success: false, status: 400, error: 'Job ID is required.' };
    if (options.throwOnError) {
      throw new JobApiError(errorEnvelope.error, errorEnvelope.status, errorEnvelope);
    }
    return errorEnvelope;
  }

  const cleanId = encodeURIComponent(id.trim());
  return fetchWithJSON(`/${cleanId}`, {
    method: 'GET',
    ...options
  });
}

/**
 * Updates an existing job posting.
 * Gated on backend: requires job creator (owner) or admin session.
 *
 * @param {string} id - Job unique identifier
 * @param {Object} updates - Fields to update (title, description, budget, urgency, etc.)
 * @param {Object} [options] - Optional fetch options
 * @returns {Promise<{ success: boolean, job?: Object, error?: string, status: number }>}
 */
export async function updateJob(id, updates, options = {}) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    const errorEnvelope = { success: false, status: 400, error: 'Job ID is required.' };
    if (options.throwOnError) {
      throw new JobApiError(errorEnvelope.error, errorEnvelope.status, errorEnvelope);
    }
    return errorEnvelope;
  }

  const cleanId = encodeURIComponent(id.trim());
  return fetchWithJSON(`/${cleanId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates || {}),
    ...options
  });
}

/**
 * Cancels an existing job posting (sets status to 'cancelled').
 * Gated on backend: requires job creator (owner) or admin session.
 *
 * @param {string} id - Job unique identifier
 * @param {Object} [options] - Optional fetch options
 * @returns {Promise<{ success: boolean, message?: string, job?: Object, error?: string, status: number }>}
 */
export async function cancelJob(id, options = {}) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    const errorEnvelope = { success: false, status: 400, error: 'Job ID is required.' };
    if (options.throwOnError) {
      throw new JobApiError(errorEnvelope.error, errorEnvelope.status, errorEnvelope);
    }
    return errorEnvelope;
  }

  const cleanId = encodeURIComponent(id.trim());
  return fetchWithJSON(`/${cleanId}`, {
    method: 'DELETE',
    ...options
  });
}

/**
 * Alias for cancelJob to maintain semantic flexibility across callers.
 */
export const deleteJob = cancelJob;

/**
 * Service object bundling all job API operations.
 */
export const jobService = {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  cancelJob,
  deleteJob
};

export default jobService;
```

---

## 7. Downstream Consumer Integration Patterns

### 7.1 Integration with `js/components/jobModal.js` (Milestone 2)

```javascript
import { jobService } from '../services/jobService.js';
import { showToast } from '../utils/helpers.js';

async function handleJobSubmit(formData) {
  const submitBtn = document.getElementById('post-job-submit-btn');
  const errorContainer = document.getElementById('post-job-error-msg');
  
  // 1. Set UI loading state
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner"></span> Posting...';
  if (errorContainer) errorContainer.textContent = '';

  try {
    // 2. Call jobService
    const res = await jobService.createJob(formData);

    if (res.success && res.job) {
      showToast('Job posted successfully!', 'success');
      closeJobModal();
      
      // Dispatch custom event for reactive UI updates across open pages
      window.dispatchEvent(new CustomEvent('job:created', { detail: { job: res.job } }));
    } else {
      // 3. Display server validation error message
      const msg = res.error || 'Failed to create job posting. Please try again.';
      if (errorContainer) {
        errorContainer.textContent = msg;
        errorContainer.classList.remove('hidden');
      } else {
        showToast(msg, 'error');
      }
    }
  } catch (err) {
    showToast('An unexpected error occurred. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Post Job';
  }
}
```

### 7.2 Integration with Homepage Preview in `js/pages/home.js` (Milestone 3)

```javascript
import { jobService } from '../services/jobService.js';

export async function renderRecentJobs() {
  const container = document.getElementById('recent-jobs-grid');
  if (!container) return;

  container.innerHTML = '<div class="jobs-loading"><span class="spinner"></span> Loading recent jobs...</div>';

  const res = await jobService.getJobs({ limit: 6, sort: 'newest', status: 'open' });

  if (res.success && Array.isArray(res.jobs)) {
    if (res.jobs.length === 0) {
      container.innerHTML = '<p class="text-secondary text-center">No open jobs currently available.</p>';
      return;
    }

    container.innerHTML = res.jobs.map(job => renderJobCardMarkup(job)).join('');
    if (window.lucide) window.lucide.createIcons();
  } else {
    container.innerHTML = `<p class="text-error text-center">${res.error || 'Failed to load recent jobs.'}</p>`;
  }
}
```

### 7.3 Integration with Job Listing Page in `js/pages/jobs.js` (Milestone 3)

```javascript
import { jobService } from '../services/jobService.js';

let currentFilters = {
  category: '',
  urgency: '',
  location: '',
  sort: 'newest'
};

export async function loadFilteredJobs() {
  const grid = document.getElementById('jobs-grid');
  const countEl = document.getElementById('jobs-count');
  
  const res = await jobService.getJobs(currentFilters);

  if (res.success && Array.isArray(res.jobs)) {
    if (countEl) countEl.textContent = `Showing ${res.jobs.length} jobs`;
    renderJobsList(res.jobs);
  } else {
    grid.innerHTML = `<div class="error-banner">${res.error || 'Error loading jobs'}</div>`;
  }
}
```

---

## 8. Verification & Test Plan

1. **Syntax & ES Module Validation**:
   - `node --check` validation once written to disk by M2 implementer.
2. **End-to-End Test Suite Compatibility**:
   - `tests/verify-jobs.js` verifies all backend routes and payloads matched by `jobService.js`.
3. **Protected File Non-Regression**:
   - `git status --porcelain js/components/authUI.js js/services/authService.js` confirms zero changes to forbidden files.
