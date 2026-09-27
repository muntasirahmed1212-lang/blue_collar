// server/controllers/jobController.js
const crypto = require('crypto');
const db = require('../db/database');

// ─── Canonical Category Dictionary ───────────────────────────────────────────
// Initialized with Object.create(null) and Object.freeze to eliminate prototype pollution
// and guarantee prototype keys (__proto__, toString, etc.) never resolve to Object.prototype.
const CATEGORY_MAP = Object.freeze(Object.assign(Object.create(null), {
  // Canonical ID mapping
  'cat-1': { id: 'cat-1', name: 'Electrician', slug: 'electrician' },
  'cat-2': { id: 'cat-2', name: 'Plumber', slug: 'plumber' },
  'cat-3': { id: 'cat-3', name: 'Carpenter', slug: 'carpenter' },
  'cat-4': { id: 'cat-4', name: 'Painter', slug: 'painter' },
  'cat-5': { id: 'cat-5', name: 'Constructor', slug: 'constructor' },
  'cat-6': { id: 'cat-6', name: 'AC Repair', slug: 'ac-repair' },
  'cat-7': { id: 'cat-7', name: 'Cleaning', slug: 'cleaning' },
  'cat-8': { id: 'cat-8', name: 'Pest Control', slug: 'pest-control' },
  'cat-9': { id: 'cat-9', name: 'Appliance Repair', slug: 'appliance-repair' },
  'cat-10': { id: 'cat-10', name: 'Locksmith', slug: 'locksmith' },
  'cat-11': { id: 'cat-11', name: 'CCTV & Security', slug: 'cctv-security' },
  'cat-12': { id: 'cat-12', name: 'Gardening', slug: 'gardening' },

  // Slug aliases
  'electrician': { id: 'cat-1', name: 'Electrician', slug: 'electrician' },
  'plumber': { id: 'cat-2', name: 'Plumber', slug: 'plumber' },
  'carpenter': { id: 'cat-3', name: 'Carpenter', slug: 'carpenter' },
  'painter': { id: 'cat-4', name: 'Painter', slug: 'painter' },
  'constructor': { id: 'cat-5', name: 'Constructor', slug: 'constructor' },
  'ac-repair': { id: 'cat-6', name: 'AC Repair', slug: 'ac-repair' },
  'cleaning': { id: 'cat-7', name: 'Cleaning', slug: 'cleaning' },
  'pest-control': { id: 'cat-8', name: 'Pest Control', slug: 'pest-control' },
  'appliance-repair': { id: 'cat-9', name: 'Appliance Repair', slug: 'appliance-repair' },
  'locksmith': { id: 'cat-10', name: 'Locksmith', slug: 'locksmith' },
  'cctv-security': { id: 'cat-11', name: 'CCTV & Security', slug: 'cctv-security' },
  'gardening': { id: 'cat-12', name: 'Gardening', slug: 'gardening' }
}));

/**
 * Safely resolves a category identifier or slug to canonical category metadata.
 * Uses Object.hasOwn and a null-prototype dictionary to prevent prototype key bypasses
 * (__proto__, toString, etc.), while correctly supporting legitimate 'constructor' category.
 *
 * @param {any} cat - Input category ID or slug
 * @returns {Object|null} Category metadata object { id, name, slug } or null if invalid
 */
function getCategoryMeta(cat) {
  if (!cat || typeof cat !== 'string') {
    return null;
  }
  const key = cat.toLowerCase().trim();
  if (!key || !Object.hasOwn(CATEGORY_MAP, key)) {
    return null;
  }
  return CATEGORY_MAP[key] || null;
}

const VALID_URGENCIES = ['low', 'medium', 'high', 'urgent'];
const VALID_STATUSES = ['open', 'in-progress', 'completed', 'cancelled'];

/**
 * Generates standard UUID v4
 */
function generateUUID() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'job-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Extracts a representative numeric value from a budget representation for sorting
 */
function extractBudgetNumber(budget) {
  if (typeof budget === 'number') return budget;
  if (!budget) return 0;
  if (typeof budget === 'object') {
    return Number(budget.max || budget.min || 0);
  }
  const matches = String(budget).match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  return Number(matches[0]);
}

/**
 * Normalizes query parameter to a safe, trimmed string.
 * Handles duplicate parameters (which Express parses as Arrays) by taking the
 * first valid element or non-empty string.
 * Guarantees that non-string inputs (objects, undefined, null, booleans)
 * cleanly resolve to the safe fallback string without throwing TypeErrors.
 *
 * @param {*} val - Raw query parameter from req.query
 * @param {string} [fallback=''] - Safe fallback default string
 * @returns {string} Clean, trimmed primitive string
 */
function normalizeQueryParam(val, fallback = '') {
  if (val === undefined || val === null) {
    return fallback;
  }
  let item = val;
  if (Array.isArray(val)) {
    const firstNonEmpty = val.find(v => typeof v === 'string' && v.trim().length > 0);
    item = firstNonEmpty !== undefined ? firstNonEmpty : val[0];
  }
  if (typeof item === 'string') {
    const trimmed = item.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  if (typeof item === 'number' && !isNaN(item)) {
    return String(item);
  }
  return fallback;
}

/**
 * Validates and formats budget inputs across primitive numbers, range objects, and strings.
 * Enforces positive amounts, prevents negative money indicators, and validates range logic (min <= max).
 * @param {*} budget - Raw budget input
 * @returns {{ valid: boolean, formatted?: string, error?: string }}
 */
function validateAndFormatBudget(budget) {
  // 1. Primitive numbers: must be finite and > 0
  if (typeof budget === 'number') {
    if (isNaN(budget) || !Number.isFinite(budget) || budget <= 0) {
      return { valid: false, error: 'Budget values must be positive.' };
    }
    return { valid: true, formatted: `$${budget}` };
  }

  // 2. Reject booleans, null, undefined, arrays, or non-object/non-string
  if (budget === null || budget === undefined || typeof budget === 'boolean' || Array.isArray(budget)) {
    return { valid: false, error: 'Budget is required.' };
  }

  // Helper to parse numbers safely from primitive or string
  function parseNum(v) {
    if (typeof v === 'number') {
      return Number.isFinite(v) ? v : null;
    }
    if (typeof v === 'string' && v.trim().length > 0) {
      const s = v.trim().replace(/^[$€£₹¥]/, '').trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // 3. Object ranges: { min, max, currency }
  if (typeof budget === 'object') {
    const hasMin = budget.min !== undefined && budget.min !== null;
    const hasMax = budget.max !== undefined && budget.max !== null;

    if (!hasMin && !hasMax) {
      return { valid: false, error: 'Budget is required.' };
    }

    let minNum, maxNum;
    if (hasMin) {
      minNum = parseNum(budget.min);
      if (minNum === null) {
        return { valid: false, error: 'Budget is required.' };
      }
    }
    if (hasMax) {
      maxNum = parseNum(budget.max);
      if (maxNum === null) {
        return { valid: false, error: 'Budget is required.' };
      }
    }

    // Min and max must be >= 0
    if ((minNum !== undefined && minNum < 0) || (maxNum !== undefined && maxNum < 0)) {
      return { valid: false, error: 'Budget values must be positive.' };
    }

    // Min <= Max
    if (minNum !== undefined && maxNum !== undefined && minNum > maxNum) {
      return { valid: false, error: 'Invalid budget range: minimum cannot exceed maximum.' };
    }

    // At least one must be > 0
    if (minNum !== undefined && maxNum !== undefined) {
      if (minNum === 0 && maxNum === 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
    } else if (minNum !== undefined && minNum <= 0) {
      return { valid: false, error: 'Budget must be greater than zero.' };
    } else if (maxNum !== undefined && maxNum <= 0) {
      return { valid: false, error: 'Budget must be greater than zero.' };
    }

    const cur = (typeof budget.currency === 'string' && budget.currency.trim())
      ? budget.currency.trim()
      : '$';

    let formatted = '';
    if (minNum !== undefined && maxNum !== undefined) {
      formatted = `${cur}${minNum} - ${cur}${maxNum}`;
    } else if (minNum !== undefined) {
      formatted = `${cur}${minNum}+`;
    } else if (maxNum !== undefined) {
      formatted = `Up to ${cur}${maxNum}`;
    }

    return { valid: true, formatted };
  }

  // 4. Strings: must not contain negative signs indicating negative money,
  // and must represent a valid non-negative amount or range.
  if (typeof budget === 'string') {
    const raw = budget.trim();
    if (!raw) {
      return { valid: false, error: 'Budget is required.' };
    }

    // Check for negative signs:
    // (a) starts with '-' or '[non-digits]-' followed by currency/digits
    if (/^[^\d]*-\s*[$€£₹¥]?\s*\d/.test(raw) || /[$€£₹¥]\s*-\s*\d/.test(raw)) {
      return { valid: false, error: 'Budget values must be positive.' };
    }
    // (b) contains multiple hyphens (e.g. "100 - -200" or "--100")
    const hyphens = (raw.match(/-/g) || []).length;
    if (hyphens > 1) {
      return { valid: false, error: 'Budget values must be positive.' };
    }
    // (c) hyphen immediately before another hyphen or after separator
    if (/(-|\bto\b)\s*-\s*[$€£₹¥]?\s*\d/.test(raw)) {
      return { valid: false, error: 'Budget values must be positive.' };
    }

    // Normalize commas in numbers (e.g. 1,000 -> 1000)
    const normalized = raw.replace(/(\d),(\d)/g, '$1$2');

    // Pattern A: Range: num1 - num2 or num1 to num2
    const rangeMatch = normalized.match(/^([^\d-]*)\s*(\d+(?:\.\d+)?)\s*(?:-|to)\s*([^\d-]*)\s*(\d+(?:\.\d+)?)\s*$/i);
    if (rangeMatch) {
      const min = Number(rangeMatch[2]);
      const max = Number(rangeMatch[4]);
      if (isNaN(min) || isNaN(max) || min < 0 || max < 0) {
        return { valid: false, error: 'Budget values must be positive.' };
      }
      if (min > max) {
        return { valid: false, error: 'Invalid budget range: minimum cannot exceed maximum.' };
      }
      if (min === 0 && max === 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
      return { valid: true, formatted: raw };
    }

    // Pattern B: "Up to" / "<=" / "<"
    const upToMatch = normalized.match(/^(?:up\s+to|max|under|<|<=)\s*([^\d]*)\s*(\d+(?:\.\d+)?)\s*$/i);
    if (upToMatch) {
      const max = Number(upToMatch[2]);
      if (isNaN(max) || max <= 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
      return { valid: true, formatted: raw };
    }

    // Pattern C: "from" / "min" / "+"
    const minMatch = normalized.match(/^(?:from|min|above|>|>=)\s*([^\d]*)\s*(\d+(?:\.\d+)?)\s*$/i) ||
                     normalized.match(/^([^\d]*)\s*(\d+(?:\.\d+)?)\s*\+\s*$/i);
    if (minMatch) {
      const min = Number(minMatch[2]);
      if (isNaN(min) || min <= 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
      return { valid: true, formatted: raw };
    }

    // Pattern D: Single amount: "$150", "150", "₹500", "150.50"
    const singleMatch = normalized.match(/^([^\d]*)\s*(\d+(?:\.\d+)?)\s*$/);
    if (singleMatch) {
      const val = Number(singleMatch[2]);
      if (isNaN(val) || val <= 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
      return { valid: true, formatted: raw };
    }

    return { valid: false, error: 'Budget must represent a valid non-negative amount or range.' };
  }

  return { valid: false, error: 'Budget is required.' };
}

/**
 * Helper to check if the session user is the creator of the job or an admin
 */
async function isOwnerOrAdmin(req, job) {
  if (!req.session || !req.session.userId || !job) {
    return false;
  }
  const userId = req.session.userId;
  if (job.customerId === userId || job.userId === userId) {
    return true;
  }
  // Check admin role
  if (req.user && req.user.role === 'admin') {
    return true;
  }
  const users = await db.readUsers();
  const user = Array.isArray(users) ? users.find(u => u && u.id === userId) : null;
  return Boolean(user && user.role === 'admin');
}

// ─── 1. POST /api/jobs (Create Job) ──────────────────────────────────────────
exports.createJob = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      title,
      description,
      category,
      location,
      urgency,
      budget,
      preferredDate,
      preferredTime,
      photos
    } = body;

    // 1. Title validation (required, string, >= 5 chars)
    if (!title || typeof title !== 'string' || title.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Title is required and must be at least 5 characters long.'
      });
    }

    // 2. Category validation (cat-1..cat-12 or valid slug)
    const categoryMeta = getCategoryMeta(category);
    if (!categoryMeta) {
      return res.status(400).json({
        success: false,
        error: 'Valid category (cat-1 to cat-12) is required.'
      });
    }

    // 3. Description validation (required, string, >= 10 chars)
    if (!description || typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Description is required (minimum 10 characters).'
      });
    }

    // 4. Location validation (required, string, >= 2 chars)
    if (!location || typeof location !== 'string' || location.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Location is required.'
      });
    }

    // 5. Urgency validation (low, medium, high, urgent)
    const normalizedUrgency = typeof urgency === 'string' ? urgency.toLowerCase().trim() : '';
    if (!VALID_URGENCIES.includes(normalizedUrgency)) {
      return res.status(400).json({
        success: false,
        error: "Urgency is required and must be one of 'low', 'medium', 'high', or 'urgent'."
      });
    }

    // 6. Budget validation
    const budgetResult = validateAndFormatBudget(budget);
    if (!budgetResult.valid) {
      return res.status(400).json({
        success: false,
        error: budgetResult.error || 'Budget is required.'
      });
    }
    const formattedBudget = budgetResult.formatted;

    const now = new Date().toISOString();

    // Customer info from req.user (attached by requireCustomer)
    const user = req.user || {};
    const customerId = user.id || req.session.userId;
    const customerName = user.fullName || 'Customer';
    const customerEmail = user.email || '';

    const newJob = {
      id: generateUUID(),
      title: title.trim(),
      description: description.trim(),
      category: categoryMeta.id,
      categorySlug: categoryMeta.slug,
      categoryName: categoryMeta.name,
      location: location.trim(),
      budget: formattedBudget,
      urgency: normalizedUrgency,
      preferredDate: (preferredDate && String(preferredDate).trim()) || 'Flexible',
      preferredTime: (preferredTime && typeof preferredTime === 'string' && preferredTime.trim()) ? preferredTime.trim() : 'Flexible',
      photos: Array.isArray(photos) ? photos.filter(p => typeof p === 'string' && p.trim()) : [],
      status: 'open',
      customerId,
      userId: customerId, // Explicit alias for compatibility
      customerName,
      customerEmail,
      createdAt: now,
      updatedAt: now
    };

    // Persist via database helper
    const created = db.createJob ? await db.createJob(newJob) : newJob;

    return res.status(201).json({
      success: true,
      job: created
    });
  } catch (error) {
    console.error('jobController.createJob error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error creating job posting.'
    });
  }
};

// ─── 2. GET /api/jobs (List & Filter Jobs) ──────────────────────────────────
exports.getJobs = async (req, res) => {
  try {
    const jobs = db.readJobs ? await db.readJobs() : [];
    const { category, urgency, location, status, sort, limit } = req.query || {};

    // 1. Filter by status (default: 'open')
    const targetStatus = normalizeQueryParam(status, 'open').toLowerCase();
    let filtered = jobs;
    if (targetStatus !== 'all') {
      filtered = filtered.filter(j => j && j.status && j.status.toLowerCase() === targetStatus);
    }

    // 2. Filter by category
    const normCategory = normalizeQueryParam(category);
    if (normCategory) {
      const catQuery = normCategory.toLowerCase();
      const meta = getCategoryMeta(catQuery);
      const targetCatId = meta ? meta.id : catQuery;
      const targetSlug = meta ? meta.slug : catQuery;
      filtered = filtered.filter(j => {
        if (!j) return false;
        const jCat = String(j.category || '').toLowerCase();
        const jSlug = String(j.categorySlug || '').toLowerCase();
        const jName = String(j.categoryName || '').toLowerCase();
        return jCat === targetCatId || jCat === targetSlug || jSlug === targetSlug || jSlug === targetCatId || jName === catQuery;
      });
    }

    // 3. Filter by urgency
    const normUrgency = normalizeQueryParam(urgency);
    if (normUrgency) {
      const urgQuery = normUrgency.toLowerCase();
      filtered = filtered.filter(j => j && String(j.urgency || '').toLowerCase() === urgQuery);
    }

    // 4. Filter by location (substring match)
    const normLocation = normalizeQueryParam(location);
    if (normLocation) {
      const locQuery = normLocation.toLowerCase();
      filtered = filtered.filter(j => j && String(j.location || '').toLowerCase().includes(locQuery));
    }

    // 5. Sort
    const sortType = normalizeQueryParam(sort, 'newest').toLowerCase();
    if (sortType === 'oldest') {
      filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sortType === 'budget' || sortType === 'budget-desc') {
      filtered.sort((a, b) => extractBudgetNumber(b.budget) - extractBudgetNumber(a.budget));
    } else if (sortType === 'budget-asc') {
      filtered.sort((a, b) => extractBudgetNumber(a.budget) - extractBudgetNumber(b.budget));
    } else {
      // Default: newest first
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // 6. Limit
    const normLimit = normalizeQueryParam(limit);
    if (normLimit) {
      const parsedLimit = parseInt(normLimit, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        filtered = filtered.slice(0, parsedLimit);
      }
    }

    return res.status(200).json({
      success: true,
      count: filtered.length,
      total: filtered.length,
      jobs: filtered
    });
  } catch (error) {
    console.error('jobController.getJobs error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error retrieving job postings.'
    });
  }
};

// ─── 3. GET /api/jobs/:id (Single Job Details) ──────────────────────────────
exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const job = db.findJobById ? await db.findJobById(id) : null;
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    return res.status(200).json({
      success: true,
      job
    });
  } catch (error) {
    console.error('jobController.getJobById error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error retrieving job details.'
    });
  }
};

// ─── 4. PATCH /api/jobs/:id (Update Job) ────────────────────────────────────
exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Require authentication check
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. Please log in.'
      });
    }

    const job = db.findJobById ? await db.findJobById(id) : null;
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Check ownership / admin access
    if (!(await isOwnerOrAdmin)(req, job)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden. You do not have permission to modify this job.'
      });
    }

    const updates = req.body || {};
    const sanitizedUpdates = {};

    // Validate updates if provided
    if (updates.title !== undefined) {
      if (typeof updates.title !== 'string' || updates.title.trim().length < 5) {
        return res.status(400).json({
          success: false,
          error: 'Title must be at least 5 characters long.'
        });
      }
      sanitizedUpdates.title = updates.title.trim();
    }

    if (updates.category !== undefined) {
      const meta = getCategoryMeta(updates.category);
      if (!meta) {
        return res.status(400).json({
          success: false,
          error: 'Valid category (cat-1 to cat-12) is required.'
        });
      }
      sanitizedUpdates.category = meta.id;
      sanitizedUpdates.categorySlug = meta.slug;
      sanitizedUpdates.categoryName = meta.name;
    }

    if (updates.description !== undefined) {
      if (typeof updates.description !== 'string' || updates.description.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: 'Description must be at least 10 characters long.'
        });
      }
      sanitizedUpdates.description = updates.description.trim();
    }

    if (updates.location !== undefined) {
      if (typeof updates.location !== 'string' || updates.location.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Location must be at least 2 characters long.'
        });
      }
      sanitizedUpdates.location = updates.location.trim();
    }

    if (updates.urgency !== undefined) {
      const urg = typeof updates.urgency === 'string' ? updates.urgency.toLowerCase().trim() : '';
      if (!VALID_URGENCIES.includes(urg)) {
        return res.status(400).json({
          success: false,
          error: "Urgency must be one of 'low', 'medium', 'high', or 'urgent'."
        });
      }
      sanitizedUpdates.urgency = urg;
    }

    if (updates.status !== undefined) {
      const st = typeof updates.status === 'string' ? updates.status.toLowerCase().trim() : '';
      if (!VALID_STATUSES.includes(st)) {
        return res.status(400).json({
          success: false,
          error: "Status must be one of 'open', 'in-progress', 'completed', or 'cancelled'."
        });
      }
      sanitizedUpdates.status = st;
    }

    if (updates.budget !== undefined) {
      const budgetResult = validateAndFormatBudget(updates.budget);
      if (!budgetResult.valid) {
        return res.status(400).json({
          success: false,
          error: budgetResult.error || 'Budget is required.'
        });
      }
      sanitizedUpdates.budget = budgetResult.formatted;
    }

    if (updates.preferredDate !== undefined) {
      sanitizedUpdates.preferredDate = String(updates.preferredDate).trim();
    }

    if (updates.preferredTime !== undefined) {
      sanitizedUpdates.preferredTime = String(updates.preferredTime).trim();
    }

    if (updates.photos !== undefined && Array.isArray(updates.photos)) {
      sanitizedUpdates.photos = updates.photos.filter(p => typeof p === 'string' && p.trim());
    }

    sanitizedUpdates.updatedAt = new Date().toISOString();

    const updated = db.updateJob ? await db.updateJob(id, sanitizedUpdates) : null;
    if (!updated) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update job record.'
      });
    }

    return res.status(200).json({
      success: true,
      job: updated
    });
  } catch (error) {
    console.error('jobController.updateJob error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error updating job posting.'
    });
  }
};

// ─── 5. DELETE /api/jobs/:id (Cancel / Delete Job) ──────────────────────────
exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Require authentication check
    if (!req.session || !req.session.userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized. Please log in.'
      });
    }

    const job = db.findJobById ? await db.findJobById(id) : null;
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Check ownership / admin access
    if (!(await isOwnerOrAdmin)(req, job)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden. You do not have permission to cancel this job.'
      });
    }

    // Soft-cancel job
    const cancelled = db.deleteJob ? await db.deleteJob(id, true) : null;

    return res.status(200).json({
      success: true,
      message: 'Job cancelled',
      job: cancelled || { ...job, status: 'cancelled' }
    });
  } catch (error) {
    console.error('jobController.deleteJob error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error cancelling job posting.'
    });
  }
};
