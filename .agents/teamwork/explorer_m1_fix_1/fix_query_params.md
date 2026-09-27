# Query Parameter Normalization & Defect 1.1 & 1.2 Analysis

**Component**: `server/controllers/jobController.js` — `exports.getJobs`  
**Defects Addressed**: Defect 1.1 (`?sort` duplicate parameter crash) & Defect 1.2 (`?status` duplicate parameter crash)  
**Author**: `explorer_m1_fix_1`  
**Target Milestone**: M1 Bugfix  
**Status**: Ready for Implementation  

---

## 1. Executive Summary

Empirical fuzzing in `tests/adversarial-fuzzing-m1.test.js` revealed that `GET /api/jobs` crashes with an unhandled **HTTP 500 Internal Server Error** whenever duplicate query parameters are passed for `sort` or `status`:
- `GET /api/jobs?sort=newest&sort=oldest` -> `TypeError: sort.toLowerCase is not a function`
- `GET /api/jobs?status=open&status=cancelled` -> `TypeError: status.toLowerCase is not a function`

Additionally, investigation into all query parameters handled by `getJobs` (`status`, `category`, `urgency`, `location`, `sort`, `limit`) identified a **secondary silent failure mode**:
- For `category`, `urgency`, and `location`, the current controller checks `typeof param === 'string'`. When duplicate parameters are passed, Express creates an `Array`, causing `typeof param === 'string'` to evaluate to `false`. Instead of filtering by the requested parameter, the controller silently skips the filter entirely and returns unfiltered jobs.
- For `limit`, `parseInt(['10', '20'], 10)` relies on accidental array-to-string coercion (`"10,20"` -> `10`), which fails unpredictably when objects or non-primitive array items are provided.

This document specifies a **robust query parameter normalization strategy** that guarantees all query parameters are converted into safe, trimmed primitive strings (taking the first element if duplicate/array), with fallback defaults, preventing any `TypeError` crash or silent filter degradation.

---

## 2. Root Cause Analysis

### 2.1 Express Query Parsing Mechanism
In `server.js`, Express 5.2.1 is configured with the default query parser (`simple`), which uses Node's native `querystring.parse`:
- A single parameter `?sort=newest` parses as:
  `req.query.sort = 'newest'` (String)
- Duplicate parameters `?sort=newest&sort=oldest` parse as:
  `req.query.sort = ['newest', 'oldest']` (Array)
- Parameter pollution via object syntax (or extended parser) can produce:
  `req.query.sort = { ... }` (Object)

### 2.2 Crash Mechanism in `server/controllers/jobController.js`

#### Defect 1.1: Line 271 (`sort`)
```javascript
const sortType = sort ? sort.toLowerCase().trim() : 'newest';
```
- When `sort` is `['newest', 'oldest']`, the truthy check `sort ?` evaluates to `true`.
- The code immediately executes `sort.toLowerCase()`.
- In JavaScript, `Array.prototype` does not possess a `toLowerCase` method.
- An unhandled `TypeError: sort.toLowerCase is not a function` is thrown.
- Caught by the enclosing `catch (error)` block, generating an HTTP 500 response:
  ```json
  { "success": false, "error": "Server error retrieving job postings." }
  ```

#### Defect 1.2: Line 237 (`status`)
```javascript
const targetStatus = status ? status.toLowerCase().trim() : 'open';
```
- When `status` is `['open', 'cancelled']`, the truthy check `status ?` evaluates to `true`.
- Executes `status.toLowerCase()`, throwing `TypeError: status.toLowerCase is not a function`.
- Yields HTTP 500 response.

### 2.3 Parameter-by-Parameter Vulnerability Matrix

| Parameter | Current Code | Array / Duplicate Behavior | Object / Pollution Behavior | Severity |
| :--- | :--- | :--- | :--- | :--- |
| `sort` | `sort ? sort.toLowerCase().trim() : 'newest'` | **CRASH 500** (`TypeError`) | **CRASH 500** (`TypeError`) | **Critical** (Defect 1.1) |
| `status` | `status ? status.toLowerCase().trim() : 'open'` | **CRASH 500** (`TypeError`) | **CRASH 500** (`TypeError`) | **Critical** (Defect 1.2) |
| `category` | `if (category && typeof category === 'string' && ...)` | Silent filter bypass (returns all jobs) | Ignored safely | **Medium** (Silent degradation) |
| `urgency` | `if (urgency && typeof urgency === 'string' && ...)` | Silent filter bypass (returns all jobs) | Ignored safely | **Medium** (Silent degradation) |
| `location` | `if (location && typeof location === 'string' && ...)` | Silent filter bypass (returns all jobs) | Ignored safely | **Medium** (Silent degradation) |
| `limit` | `const parsedLimit = parseInt(limit, 10);` | Accidental coercion `"10,20"` -> `10` | `NaN` (ignored) | **Low** (Brittle coercion) |

---

## 3. Query Parameter Normalization Architecture

### 3.1 Normalization Helper Function: `normalizeQueryParam`

We introduce a dedicated, pure helper function in `server/controllers/jobController.js`:

```javascript
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
    // Take the first non-empty string if available, or the first element
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
```

### 3.2 Key Properties of `normalizeQueryParam`
1. **Array Flattening**: When an Array is supplied (e.g. `['newest', 'oldest']`), it cleanly takes the first element `'newest'` (or first non-empty string if `['', 'oldest']` was supplied).
2. **Type Safety**: If an object (e.g. `{ $ne: null }`), boolean, or symbol is injected, it rejects it and safely returns `fallback`.
3. **Whitespace Trimming**: Trims leading and trailing whitespace automatically.
4. **Fallback Handling**: If an empty string or whitespace-only string is passed (e.g. `?sort=` or `?status=`), it cleanly falls back to the specified default (e.g. `'newest'` or `'open'`).
5. **Zero Exceptions**: Under no circumstances can this function throw a `TypeError`.

---

## 4. Normalization Strategy by Query Parameter

### 4.1 `status`
- **Default / Fallback**: `'open'`
- **Target Logic**:
  ```javascript
  const targetStatus = normalizeQueryParam(status, 'open').toLowerCase();
  let filtered = jobs;
  if (targetStatus !== 'all') {
    filtered = filtered.filter(j => j && j.status && j.status.toLowerCase() === targetStatus);
  }
  ```
- **Test Scenarios**:
  - `?status=open&status=cancelled` -> `targetStatus = 'open'`, filters open jobs, HTTP 200.
  - `?status=cancelled&status=open` -> `targetStatus = 'cancelled'`, filters cancelled jobs, HTTP 200.
  - `?status=all` -> `targetStatus = 'all'`, includes all jobs, HTTP 200.
  - `?status=` or unsupplied -> `targetStatus = 'open'`, HTTP 200.
  - `?status[bad]=1` -> `targetStatus = 'open'`, HTTP 200.

### 4.2 `category`
- **Default / Fallback**: `''`
- **Target Logic**:
  ```javascript
  const normCategory = normalizeQueryParam(category);
  if (normCategory) {
    const catQuery = normCategory.toLowerCase();
    const meta = Object.prototype.hasOwnProperty.call(CATEGORY_MAP, catQuery) ? CATEGORY_MAP[catQuery] : null;
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
  ```
- **Test Scenarios**:
  - `?category=cat-1&category=cat-2` -> `normCategory = 'cat-1'`, filters for `cat-1`, HTTP 200.
  - `?category=electrician` -> resolves to `cat-1`, HTTP 200.
  - `?category=__proto__` -> `hasOwnProperty` blocks prototype key bypass, matches no jobs, HTTP 200.
  - Unsupplied -> `normCategory = ''`, filter skipped, HTTP 200.

### 4.3 `urgency`
- **Default / Fallback**: `''`
- **Target Logic**:
  ```javascript
  const normUrgency = normalizeQueryParam(urgency);
  if (normUrgency) {
    const urgQuery = normUrgency.toLowerCase();
    filtered = filtered.filter(j => j && String(j.urgency || '').toLowerCase() === urgQuery);
  }
  ```
- **Test Scenarios**:
  - `?urgency=high&urgency=low` -> `normUrgency = 'high'`, filters urgency `'high'`, HTTP 200.
  - `?urgency=urgent` -> filters urgency `'urgent'`, HTTP 200.
  - Unsupplied -> `normUrgency = ''`, filter skipped, HTTP 200.

### 4.4 `location`
- **Default / Fallback**: `''`
- **Target Logic**:
  ```javascript
  const normLocation = normalizeQueryParam(location);
  if (normLocation) {
    const locQuery = normLocation.toLowerCase();
    filtered = filtered.filter(j => j && String(j.location || '').toLowerCase().includes(locQuery));
  }
  ```
- **Test Scenarios**:
  - `?location=New%20York&location=Boston` -> `normLocation = 'New York'`, filters substring `'new york'`, HTTP 200.
  - `?location=.*+?^${}()|[]\\` -> safe substring match via `includes`, HTTP 200.
  - Unsupplied -> `normLocation = ''`, filter skipped, HTTP 200.

### 4.5 `sort`
- **Default / Fallback**: `'newest'`
- **Target Logic**:
  ```javascript
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
  ```
- **Test Scenarios**:
  - `?sort=newest&sort=oldest` -> `sortType = 'newest'`, sorts newest first, HTTP 200.
  - `?sort=oldest&sort=newest` -> `sortType = 'oldest'`, sorts oldest first, HTTP 200.
  - `?sort=budget` -> sorts highest budget first, HTTP 200.
  - `?sort=budget-asc` -> sorts lowest budget first, HTTP 200.
  - `?sort=` or unsupplied -> `sortType = 'newest'`, HTTP 200.
  - `?sort[bad]=1` -> `sortType = 'newest'`, HTTP 200.

### 4.6 `limit`
- **Default / Fallback**: `''`
- **Target Logic**:
  ```javascript
  const normLimit = normalizeQueryParam(limit);
  if (normLimit) {
    const parsedLimit = parseInt(normLimit, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      filtered = filtered.slice(0, parsedLimit);
    }
  }
  ```
- **Test Scenarios**:
  - `?limit=5&limit=10` -> `normLimit = '5'`, `parsedLimit = 5`, slices 5 items, HTTP 200.
  - `?limit=-5` -> `parsedLimit > 0` is false, no slicing, HTTP 200.
  - `?limit=abc` -> `isNaN(parsedLimit)` is true, no slicing, HTTP 200.
  - Unsupplied -> `normLimit = ''`, no slicing, HTTP 200.

---

## 5. Exact Code Changes for `server/controllers/jobController.js`

### Change 1: Add `normalizeQueryParam` Helper Function
Insert after line 62 (`extractBudgetNumber` function):

```javascript
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
```

### Change 2: Update `exports.getJobs` (Lines 231–304)

#### Current Code (BEFORE):
```javascript
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
```

#### Proposed Code (AFTER):
```javascript
// ─── 2. GET /api/jobs (List & Filter Jobs) ──────────────────────────────────
exports.getJobs = (req, res) => {
  try {
    const jobs = db.readJobs ? db.readJobs() : [];
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
      const meta = Object.prototype.hasOwnProperty.call(CATEGORY_MAP, catQuery) ? CATEGORY_MAP[catQuery] : null;
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
```

---

## 6. Verification and Invalidation Criteria

### 6.1 Direct Reproduction Verification
Run the following verification script before and after applying changes:
```powershell
node -e "
const express = require('express');
const app = express();
app.use('/api/jobs', require('./server/routes/jobs'));
const s = app.listen(0, async () => {
  const p = s.address().port;
  const r1 = await fetch('http://127.0.0.1:' + p + '/api/jobs?sort=newest&sort=oldest');
  console.log('sort HTTP status:', r1.status);
  const r2 = await fetch('http://127.0.0.1:' + p + '/api/jobs?status=open&status=cancelled');
  console.log('status HTTP status:', r2.status);
  const r3 = await fetch('http://127.0.0.1:' + p + '/api/jobs?category=cat-1&category=cat-2');
  console.log('category HTTP status:', r3.status);
  s.close();
});"
```
- **Before Fix**: Returns status `500` for sort and status.
- **After Fix**: Returns status `200` for all three requests.

### 6.2 Test Suite Verification
1. `node tests/verify-jobs.js` must remain 100% passing (34/34 tests pass).
2. In `node tests/adversarial-fuzzing-m1.test.js`:
   - `F8.1_dup_sort` passes (returns 200).
   - `F8.2_dup_status` passes (returns 200).
   - `F8.3_dup_cat` passes (returns 200).
   - `F8.4_dup_urg` passes (returns 200).

### 6.3 Invalidation Conditions
- If any query parameter invocation produces an unhandled exception or 500 status code.
- If duplicate parameters result in dropped filters instead of taking the first specified parameter.
- If existing single-parameter filtering (`?category=cat-1`, `?urgency=high`, `?status=all`) regresses.
