# Technical Specification & Implementation Plan: Controller & Router (Milestone M1)

**Component**: Milestone M1 — Controller & Router API Design  
**Target Files**: `server/controllers/jobController.js`, `server/routes/jobs.js`, `server.js`  
**Author**: `explorer_m1_3`  
**Date**: 2026-09-26  
**Status**: Ready for Implementation  
**Strict Invariants**:
- Read-only exploration and planning. Zero direct source code modifications.
- NEVER touch `js/components/authUI.js` or `js/services/authService.js`.
- All code proposals written to `.agents/teamwork/explorer_m1_3/`.

---

## 1. Executive Summary & Integration Architecture

The BlueCollar Connect platform is extending its capabilities to include a full "Post Jobs" feature. This document defines the technical specification and drop-in code for:
1. **`server/controllers/jobController.js`**: The business logic and request validation layer handling CRUD operations, input sanitization, category canonicalization, query filtering, multi-criteria sorting, ownership authorization checks, and error responses.
2. **`server/routes/jobs.js`**: The Express 5 router orchestrating public endpoints and middleware-protected endpoints.
3. **`server.js` (Line 62 mounting)**: The exact integration into Express's middleware pipeline.

### Integration Pipeline Flow
```
[ Incoming HTTP Request ]
          │
          ▼
   [ Helmet & CORS ]
          │
          ▼
   [ express.json() & express.urlencoded() ]
          │
          ▼
   [ express-session (connect.sid) ]
          │
          ▼
   [ /api/ Global Rate Limiter ]
          │
          ├──────────────────────────► /api/auth/* (authRoutes)
          │
          ├──────────────────────────► /api/jobs/* (jobRoutes) <── MOUNTED AT LINE 62
          │                                  │
          │                                  ├── GET  /api/jobs       (Public -> jobController.getJobs)
          │                                  ├── GET  /api/jobs/:id   (Public -> jobController.getJobById)
          │                                  ├── POST /api/jobs       (requireCustomer -> jobController.createJob)
          │                                  ├── PATCH /api/jobs/:id  (requireAuth -> jobController.updateJob)
          │                                  └── DELETE /api/jobs/:id (requireAuth -> jobController.deleteJob)
          │
          ▼
   [ express.static (Serve static site) ]
          │
          ▼
   [ Catch-all fallback to index.html ]
```

---

## 2. Category Normalization & Validation Contract

In `js/data/categories.js`, the platform defines 12 core service categories. Clients may submit either the category ID (`cat-1` .. `cat-12`) or the category slug (`electrician`, `plumber`, etc.). The controller normalizes all inputs into the canonical ID and denormalized display name.

### Canonical Category Dictionary
```javascript
const CATEGORY_MAP = {
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
};
```

---

## 3. Detailed Endpoint Specifications

### 3.1 Endpoint 1: `POST /api/jobs`
Creates a new job posting.

- **URL**: `/api/jobs`
- **Method**: `POST`
- **Access Control**: Authenticated, verified customer (`requireCustomer` middleware).
  - Unauthenticated (missing `req.session.userId`) -> **401 Unauthorized**:
    ```json
    { "success": false, "error": "Unauthorized. Please log in." }
    ```
  - Authenticated but `user.role !== 'customer'` or `!user.isVerified` -> **403 Forbidden**:
    ```json
    { "success": false, "error": "Only verified customers can post jobs." }
    ```
- **Validation Rules**:
  | Field | Type | Validation Constraint | Error Message on Failure (HTTP 400) |
  |---|---|---|---|
  | `title` | `string` | Required, non-empty, trimmed length >= 5 | `"Title is required and must be at least 5 characters long."` |
  | `category` | `string` | Required, must match `cat-1`..`cat-12` or valid slug | `"Valid category (cat-1 to cat-12) is required."` |
  | `description` | `string` | Required, non-empty, trimmed length >= 10 | `"Description is required (minimum 10 characters)."` |
  | `location` | `string` | Required, non-empty, trimmed length >= 2 | `"Location is required."` |
  | `urgency` | `string` | Required, one of `['low', 'medium', 'high', 'urgent']` | `"Urgency is required and must be one of 'low', 'medium', 'high', or 'urgent'."` |
  | `budget` | `string`/`number`/`object` | Required, non-empty | `"Budget is required."` |
  | `preferredDate` | `string` | Required, non-empty | `"Preferred date is required."` |
  | `preferredTime` | `string` | Optional, string (default: `"Flexible"`) | N/A |
  | `photos` | `array` | Optional, array of strings (default: `[]`) | N/A |

- **Processing & Assembly**:
  1. Generate UUID v4: `const id = crypto.randomUUID ? crypto.randomUUID() : ...`
  2. Resolve Category: Look up `CATEGORY_MAP[category.toLowerCase().trim()]`.
  3. Format Budget: If string, trim; if object `{ min, max }`, stringify as `"$min - $max"`; if number, format as `"$number"`.
  4. Attach User Context:
     - `customerId`: `req.user.id`
     - `userId`: `req.user.id` (alias for backward compatibility)
     - `customerName`: `req.user.fullName`
     - `customerEmail`: `req.user.email`
  5. Set initial lifecycle status: `'open'`.
  6. Set timestamps: `createdAt` and `updatedAt` to `new Date().toISOString()`.
  7. Persist to disk via `db.createJob(jobData)`.
- **Success Response (HTTP 201 Created)**:
  ```json
  {
    "success": true,
    "job": {
      "id": "c71e21b8-e215-460f-90e6-1215b22b001a",
      "title": "Fix Leaking Bathroom Pipe Under Sink",
      "description": "Pipe is dripping steadily causing water pooling. Need replacement washer/fitting.",
      "category": "cat-2",
      "categoryName": "Plumber",
      "location": "Downtown, Brooklyn, NY",
      "budget": "$100 - $150",
      "urgency": "high",
      "preferredDate": "2026-10-01",
      "preferredTime": "Morning (9am - 12pm)",
      "photos": [],
      "status": "open",
      "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
      "userId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
      "customerName": "Montashir",
      "customerEmail": "muntasirahmed1212@gmail.com",
      "createdAt": "2026-09-26T00:15:00.000Z",
      "updatedAt": "2026-09-26T00:15:00.000Z"
    }
  }
  ```

---

### 3.2 Endpoint 2: `GET /api/jobs`
Public search, filter, and pagination listing of jobs.

- **URL**: `/api/jobs`
- **Method**: `GET`
- **Access Control**: Public (No authentication required).
- **Query Parameters**:
  - `category` *(optional, string)*: Filter by category ID (e.g. `cat-1`) or slug (e.g. `electrician`).
  - `urgency` *(optional, string)*: Filter by urgency (`low`, `medium`, `high`, `urgent`).
  - `location` *(optional, string)*: Case-insensitive substring match on `job.location`.
  - `status` *(optional, string)*: Defaults to `'open'`. If set to `'all'`, returns jobs across all statuses (`open`, `in-progress`, `completed`, `cancelled`).
  - `sort` *(optional, string)*:
    - `'newest'` (or `'date'` or default): Newest first (`b.createdAt - a.createdAt`).
    - `'oldest'`: Oldest first (`a.createdAt - b.createdAt`).
    - `'budget'` or `'budget-desc'`: Highest budget first.
    - `'budget-asc'`: Lowest budget first.
  - `limit` *(optional, integer)*: Maximum number of jobs returned (e.g., `limit=6` for homepage preview).
- **Processing**:
  1. Retrieve all jobs via `db.readJobs()`.
  2. Filter by `status` (default: `'open'`).
  3. Filter by `category` if specified (matches `category`, `categorySlug`, or `categoryName`).
  4. Filter by `urgency` if specified (case-insensitive).
  5. Filter by `location` if specified (case-insensitive substring).
  6. Apply sorting logic based on `sort` param (with numeric extraction for budget sorting).
  7. Apply `limit` slice if specified.
- **Success Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "count": 6,
    "total": 6,
    "jobs": [
      {
        "id": "e4a11f20-9bf7-4c8d-b108-112233445501",
        "title": "Emergency AC Servicing - Unit Blowing Warm Air",
        "description": "Central split AC unit stopped cooling yesterday afternoon...",
        "category": "cat-6",
        "categoryName": "AC Repair",
        "location": "Astoria, Queens, NY",
        "budget": "$200 - $350",
        "urgency": "urgent",
        "preferredDate": "2026-09-26",
        "preferredTime": "Immediate / Morning",
        "photos": [],
        "status": "open",
        "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
        "customerName": "Montashir",
        "createdAt": "2026-09-25T17:30:00.000Z",
        "updatedAt": "2026-09-25T17:30:00.000Z"
      }
    ]
  }
  ```

---

### 3.3 Endpoint 3: `GET /api/jobs/:id`
Retrieves detailed information for a single job posting.

- **URL**: `/api/jobs/:id`
- **Method**: `GET`
- **Access Control**: Public.
- **Processing**:
  1. Read `req.params.id`.
  2. Query `db.findJobById(id)`.
  3. If job not found, return **404 Not Found**:
     ```json
     { "success": false, "error": "Job not found" }
     ```
  4. If found, return **200 OK**:
     ```json
     {
       "success": true,
       "job": { ... }
     }
     ```

---

### 3.4 Endpoint 4: `PATCH /api/jobs/:id`
Updates an existing job posting.

- **URL**: `/api/jobs/:id`
- **Method**: `PATCH`
- **Access Control**: Authenticated creator of the job (`job.customerId === req.session.userId` or `job.userId === req.session.userId`) OR platform admin (`user.role === 'admin'`).
- **Authorization Sequence**:
  1. Check `req.session.userId` -> 401 if missing:
     ```json
     { "success": false, "error": "Unauthorized. Please log in." }
     ```
  2. Query job by `req.params.id`. If not found -> **404 Not Found**:
     ```json
     { "success": false, "error": "Job not found" }
     ```
  3. Verify ownership: If user is not the job's creator and not an admin -> **403 Forbidden**:
     ```json
     { "success": false, "error": "Forbidden. You do not have permission to modify this job." }
     ```
- **Validation on Updatable Fields**:
  - `title`: if provided, must be string with trimmed length >= 5.
  - `category`: if provided, must match valid category ID or slug.
  - `description`: if provided, must be string with trimmed length >= 10.
  - `urgency`: if provided, must be in `['low', 'medium', 'high', 'urgent']`.
  - `status`: if provided, must be in `['open', 'in-progress', 'completed', 'cancelled']`.
  - Immutable fields: `id`, `customerId`, `userId`, `customerName`, `customerEmail`, `createdAt`.
- **Processing**:
  - Apply sanitized updates.
  - Set `updatedAt = new Date().toISOString()`.
  - Save via `db.updateJob(id, updates)`.
- **Success Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "job": {
      "id": "c71e21b8-e215-460f-90e6-1215b22b001a",
      "title": "Fix Leaking Bathroom Pipe Under Sink (Updated)",
      "status": "in-progress",
      "updatedAt": "2026-09-26T00:20:00.000Z",
      ...
    }
  }
  ```

---

### 3.5 Endpoint 5: `DELETE /api/jobs/:id`
Cancels or removes an existing job posting.

- **URL**: `/api/jobs/:id`
- **Method**: `DELETE`
- **Access Control**: Authenticated creator of the job or admin.
- **Authorization Sequence**:
  1. Check `req.session.userId` -> 401 if missing.
  2. Query job by `id`. If not found -> 404 (`{ success: false, error: "Job not found" }`).
  3. Check ownership: `job.customerId === req.session.userId` or `user.role === 'admin'`. If not -> 403:
     ```json
     { "success": false, "error": "Forbidden. You do not have permission to cancel this job." }
     ```
- **Operation**:
  - Soft-cancel: update `status = 'cancelled'` and update timestamp `updatedAt`.
  - Persist via `db.deleteJob(id)` (or `db.updateJob(id, { status: 'cancelled' })`).
- **Success Response (HTTP 200 OK)**:
  ```json
  {
    "success": true,
    "message": "Job cancelled",
    "job": {
      "id": "c71e21b8-e215-460f-90e6-1215b22b001a",
      "status": "cancelled",
      "updatedAt": "2026-09-26T00:25:00.000Z",
      ...
    }
  }
  ```

---

## 4. Complete Code Proposal: `server/controllers/jobController.js`

Here is the complete, self-contained implementation code for `server/controllers/jobController.js`:

```javascript
// server/controllers/jobController.js
const crypto = require('crypto');
const db = require('../db/database');

// ─── Canonical Category Dictionary ───────────────────────────────────────────
const CATEGORY_MAP = {
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
};

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
 * Helper to check if the session user is the creator of the job or an admin
 */
function isOwnerOrAdmin(req, job) {
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
  const users = db.readUsers();
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

    // 1. Title validation (>= 5 chars)
    if (typeof title !== 'string' || title.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Title is required and must be at least 5 characters long.'
      });
    }

    // 2. Category validation (cat-1..cat-12 or valid slug)
    if (!category || typeof category !== 'string' || !CATEGORY_MAP[category.toLowerCase().trim()]) {
      return res.status(400).json({
        success: false,
        error: 'Valid category (cat-1 to cat-12) is required.'
      });
    }

    // 3. Description validation (>= 10 chars)
    if (typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Description is required (minimum 10 characters).'
      });
    }

    // 4. Location validation (>= 2 chars)
    if (typeof location !== 'string' || location.trim().length < 2) {
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
    let formattedBudget = '';
    if (typeof budget === 'string' && budget.trim().length > 0) {
      formattedBudget = budget.trim();
    } else if (typeof budget === 'number') {
      formattedBudget = `$${budget}`;
    } else if (typeof budget === 'object' && budget !== null && (budget.min !== undefined || budget.max !== undefined)) {
      const min = budget.min !== undefined ? budget.min : 0;
      const max = budget.max !== undefined ? budget.max : min;
      const cur = budget.currency || '$';
      formattedBudget = `${cur}${min} - ${cur}${max}`;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Budget is required.'
      });
    }

    // 7. Preferred Date validation
    if (!preferredDate || (typeof preferredDate !== 'string' && !(preferredDate instanceof Date)) || !String(preferredDate).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Preferred date is required.'
      });
    }

    const categoryMeta = CATEGORY_MAP[category.toLowerCase().trim()];
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
      categoryName: categoryMeta.name,
      location: location.trim(),
      budget: formattedBudget,
      urgency: normalizedUrgency,
      preferredDate: String(preferredDate).trim(),
      preferredTime: typeof preferredTime === 'string' && preferredTime.trim() ? preferredTime.trim() : 'Flexible',
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
    const created = db.createJob ? db.createJob(newJob) : newJob;

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
exports.getJobs = (req, res) => {
  try {
    const jobs = db.readJobs ? db.readJobs() : [];
    const { category, urgency, location, status, sort, limit } = req.query || {};

    // 1. Filter by status (default: 'open')
    const targetStatus = status ? status.toLowerCase().trim() : 'open';
    let filtered = jobs;
    if (targetStatus !== 'all') {
      filtered = filtered.filter(j => j && j.status && j.status.toLowerCase() === targetStatus);
    }

    // 2. Filter by category
    if (category && typeof category === 'string' && category.trim()) {
      const catQuery = category.toLowerCase().trim();
      const meta = CATEGORY_MAP[catQuery];
      const targetCatId = meta ? meta.id : catQuery;
      filtered = filtered.filter(j => {
        if (!j) return false;
        const jCat = String(j.category || '').toLowerCase();
        const jName = String(j.categoryName || '').toLowerCase();
        return jCat === targetCatId || jCat === catQuery || jName === catQuery;
      });
    }

    // 3. Filter by urgency
    if (urgency && typeof urgency === 'string' && urgency.trim()) {
      const urgQuery = urgency.toLowerCase().trim();
      filtered = filtered.filter(j => j && String(j.urgency || '').toLowerCase() === urgQuery);
    }

    // 4. Filter by location (substring match)
    if (location && typeof location === 'string' && location.trim()) {
      const locQuery = location.toLowerCase().trim();
      filtered = filtered.filter(j => j && String(j.location || '').toLowerCase().includes(locQuery));
    }

    // 5. Sort
    const sortType = sort ? sort.toLowerCase().trim() : 'newest';
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
    if (limit) {
      const parsedLimit = parseInt(limit, 10);
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
exports.getJobById = (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const job = db.findJobById ? db.findJobById(id) : null;
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

    const job = db.findJobById ? db.findJobById(id) : null;
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Check ownership / admin access
    if (!isOwnerOrAdmin(req, job)) {
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
      if (typeof updates.category !== 'string' || !CATEGORY_MAP[updates.category.toLowerCase().trim()]) {
        return res.status(400).json({
          success: false,
          error: 'Valid category (cat-1 to cat-12) is required.'
        });
      }
      const meta = CATEGORY_MAP[updates.category.toLowerCase().trim()];
      sanitizedUpdates.category = meta.id;
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
      if (typeof updates.budget === 'string' && updates.budget.trim()) {
        sanitizedUpdates.budget = updates.budget.trim();
      } else if (typeof updates.budget === 'number') {
        sanitizedUpdates.budget = `$${updates.budget}`;
      }
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

    const updated = db.updateJob ? db.updateJob(id, sanitizedUpdates) : null;
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

    const job = db.findJobById ? db.findJobById(id) : null;
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    // Check ownership / admin access
    if (!isOwnerOrAdmin(req, job)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden. You do not have permission to cancel this job.'
      });
    }

    // Soft-cancel job
    const cancelled = db.deleteJob ? db.deleteJob(id, true) : null;

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
```

---

## 5. Complete Code Proposal: `server/routes/jobs.js`

Here is the complete implementation for `server/routes/jobs.js`:

```javascript
// server/routes/jobs.js
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { requireAuth, requireCustomer } = require('../middleware/authMiddleware');

// ─── Public Endpoints ────────────────────────────────────────────────────────
// GET /api/jobs - List, search, filter open jobs
router.get('/', jobController.getJobs);

// GET /api/jobs/:id - Single job details
router.get('/:id', jobController.getJobById);

// ─── Protected Endpoints ─────────────────────────────────────────────────────
// POST /api/jobs - Only verified customers can create jobs
router.post('/', requireCustomer, jobController.createJob);

// PATCH /api/jobs/:id - Only authenticated owner/admin can update job
router.patch('/:id', requireAuth, jobController.updateJob);

// DELETE /api/jobs/:id - Only authenticated owner/admin can cancel job
router.delete('/:id', requireAuth, jobController.deleteJob);

module.exports = router;
```

---

## 6. Integration in `server.js` (Exact Mounting at Line 62)

### Inspection of Existing `server.js`
In `server.js`:
- Line 10: `const authRoutes = require('./server/routes/auth');`
- Line 60: `// ─── API Routes ────────────────────────────────`
- Line 61: `app.use('/api/auth', authRoutes);`
- Line 62: ` ` *(Empty line)*
- Line 63: `// ─── Serve Static Files (your existing site) ──`
- Line 64: `app.use(express.static(path.join(__dirname, '.')));`

### Required Edits to `server.js`

#### Edit 1: Import Route at Top of `server.js` (Lines 10-12)
**Before:**
```javascript
const authRoutes = require('./server/routes/auth');

const app = express();
```
**After:**
```javascript
const authRoutes = require('./server/routes/auth');
const jobRoutes = require('./server/routes/jobs');

const app = express();
```

#### Edit 2: Mount Route at Line 62 of `server.js`
**Before:**
```javascript
// ─── API Routes ────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── Serve Static Files (your existing site) ──
app.use(express.static(path.join(__dirname, '.')));
```
**After:**
```javascript
// ─── API Routes ────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);

// ─── Serve Static Files (your existing site) ──
app.use(express.static(path.join(__dirname, '.')));
```

### Rationale for Line 62 Mounting
1. **Pipeline Precedence**: Placing `app.use('/api/jobs', jobRoutes)` before `app.use(express.static(...))` prevents static file resolution or the wildcard catch-all (`res.sendFile('index.html')`) from swallowing API requests.
2. **Middleware Inheritance**: Because it is mounted after `app.use('/api/', globalLimiter)` (line 58), `/api/jobs` automatically receives DDoS and brute-force protection.
3. **Session Availability**: Because it is mounted after `app.use(session(...))` (lines 41-50), `req.session` is already parsed and available for cookie verification.

---

## 7. Status Code Standardization & Defensive Error Matrix

| Scenario | HTTP Status | Response Payload | Emitted By |
|---|---|---|---|
| Job created successfully | **201 Created** | `{"success": true, "job": {...}}` | `createJob` |
| Job list retrieved successfully | **200 OK** | `{"success": true, "count": N, "total": N, "jobs": [...]}` | `getJobs` |
| Job details retrieved | **200 OK** | `{"success": true, "job": {...}}` | `getJobById` |
| Job updated successfully | **200 OK** | `{"success": true, "job": {...}}` | `updateJob` |
| Job cancelled successfully | **200 OK** | `{"success": true, "message": "Job cancelled", "job": {...}}` | `deleteJob` |
| Missing/short title (< 5 chars) | **400 Bad Request** | `{"success": false, "error": "Title is required and must be at least 5 characters long."}` | `createJob` |
| Invalid category | **400 Bad Request** | `{"success": false, "error": "Valid category (cat-1 to cat-12) is required."}` | `createJob` / `updateJob` |
| Short description (< 10 chars) | **400 Bad Request** | `{"success": false, "error": "Description is required (minimum 10 characters)."}` | `createJob` |
| Missing location | **400 Bad Request** | `{"success": false, "error": "Location is required."}` | `createJob` |
| Invalid urgency | **400 Bad Request** | `{"success": false, "error": "Urgency is required and must be one of 'low', 'medium', 'high', or 'urgent'."}` | `createJob` / `updateJob` |
| Missing budget | **400 Bad Request** | `{"success": false, "error": "Budget is required."}` | `createJob` |
| Missing preferred date | **400 Bad Request** | `{"success": false, "error": "Preferred date is required."}` | `createJob` |
| Unauthenticated request | **401 Unauthorized** | `{"success": false, "error": "Unauthorized. Please log in."}` | `requireCustomer` / `requireAuth` |
| Unverified customer / wrong role | **403 Forbidden** | `{"success": false, "error": "Only verified customers can post jobs."}` | `requireCustomer` |
| Non-owner modify attempt | **403 Forbidden** | `{"success": false, "error": "Forbidden. You do not have permission to modify this job."}` | `updateJob` |
| Non-owner cancel attempt | **403 Forbidden** | `{"success": false, "error": "Forbidden. You do not have permission to cancel this job."}` | `deleteJob` |
| Non-existent job ID | **404 Not Found** | `{"success": false, "error": "Job not found"}` | `getJobById` / `updateJob` / `deleteJob` |
| Unhandled server exception | **500 Server Error** | `{"success": false, "error": "Server error ..."}` | `try/catch` handlers |

---

## 8. Cross-Milestone Interoperability & Alignment

1. **Alignment with `explorer_m1_1` (`plan_database.md`)**:
   - `createJob`: Uses identical field names (`id`, `title`, `description`, `category`, `categoryName`, `location`, `budget`, `urgency`, `preferredDate`, `preferredTime`, `photos`, `status`, `customerId`, `userId`, `customerName`, `customerEmail`, `createdAt`, `updatedAt`).
   - `readJobs`: Sourced directly from `server/db/jobs.json`.
   - `findJobById`: Matches by trimmed UUID string.
   - `updateJob` & `deleteJob`: Uses soft-cancellation (`status: 'cancelled'`) preserving immutable fields.

2. **Alignment with `explorer_m1_2` (`plan_auth_middleware.md`)**:
   - `requireCustomer`: Validates session -> checks user in `database.js` -> asserts `isVerified === true` and `role === 'customer'` -> attaches `req.user`.
   - `requireAuth`: Enforces active session for `PATCH` and `DELETE`.
   - Ownership matching: Supports both `job.customerId` and `job.userId` aliases against `req.session.userId`, and grants access to users with `role === 'admin'`.

3. **Alignment with Track T (`tests/verify-jobs.js`)**:
   - Status code expectations (201/200 on creation, 200 on list/read/patch/delete, 400 on validation failure, 401 unauthenticated, 403 forbidden, 404 not found) match the automated test suite contract exactly.

---

## 9. Implementation Checklist for M1 Implementer

- [ ] Create `server/controllers/jobController.js` using the exact code in Section 4.
- [ ] Create `server/routes/jobs.js` using the exact code in Section 5.
- [ ] Update `server.js` lines 10-12 to import `jobRoutes`.
- [ ] Update `server.js` line 62 to mount `app.use('/api/jobs', jobRoutes);`.
- [ ] Verify server starts cleanly: `node server.js`.
- [ ] Run test suite: `node tests/verify-jobs.js`.
- [ ] Run existing regression tests: `node tests/verify-all-ac.js`.
