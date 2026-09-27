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
