# Handoff Report: Milestone M1 — Edge Cases & Adversarial Fuzzing Review

**Agent**: `challenger_m1_2`  
**Role**: Empirical Challenger / Critic / Specialist  
**Status**: Task Complete (Hard Handoff)  
**Date**: 2026-09-25T19:04:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

A dedicated empirical fuzzing test suite was written in `tests/adversarial-fuzzing-m1.test.js` exercising 125 test vectors across 10 functional and boundary suites against the Milestone M1 endpoints (`POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/:id`, `PATCH /api/jobs/:id`, and `DELETE /api/jobs/:id`).

Execution command:
```powershell
node tests/adversarial-fuzzing-m1.test.js
```

### Direct Empirical Findings:

#### 1.1 Unhandled HTTP 500 Crash on Duplicate `sort` Query Parameter
- **Target File**: `server/controllers/jobController.js`
- **Line 271**:
  ```javascript
  const sortType = sort ? sort.toLowerCase().trim() : 'newest';
  ```
- **Observed Behavior**:
  When a request provides duplicate `sort` query parameters (e.g. `GET /api/jobs?sort=newest&sort=oldest`), Express parses `req.query.sort` as an Array `['newest', 'oldest']`.
  Invoking `.toLowerCase()` on an array throws:
  ```
  TypeError: sort.toLowerCase is not a function
      at exports.getJobs (C:\Users\munta\Downloads\blue_collar\server\controllers\jobController.js:271:34)
  ```
- **Response**: HTTP 500 Internal Server Error:
  ```json
  { "success": false, "error": "Server error retrieving job postings." }
  ```
- **Harness Failure**: `F8.1_dup_sort` failed.

#### 1.2 Unhandled HTTP 500 Crash on Duplicate `status` Query Parameter
- **Target File**: `server/controllers/jobController.js`
- **Line 237**:
  ```javascript
  const targetStatus = status ? status.toLowerCase().trim() : 'open';
  ```
- **Observed Behavior**:
  When a request provides duplicate `status` query parameters (e.g. `GET /api/jobs?status=open&status=cancelled`), Express parses `req.query.status` as an Array `['open', 'cancelled']`.
  Invoking `.toLowerCase()` on an array throws:
  ```
  TypeError: status.toLowerCase is not a function
      at exports.getJobs (C:\Users\munta\Downloads\blue_collar\server\controllers\jobController.js:237:42)
  ```
- **Response**: HTTP 500 Internal Server Error:
  ```json
  { "success": false, "error": "Server error retrieving job postings." }
  ```
- **Harness Failure**: `F8.2_dup_status` failed.

#### 1.3 Prototype Key Validation Bypass on `category: "__proto__"`
- **Target File**: `server/controllers/jobController.js`
- **Lines 108–113 & 376–381**:
  ```javascript
  if (!category || typeof category !== 'string' || !CATEGORY_MAP[category.toLowerCase().trim()]) {
    return res.status(400).json({
      success: false,
      error: 'Valid category (cat-1 to cat-12) is required.'
    });
  }
  ```
- **Observed Behavior**:
  `CATEGORY_MAP` is declared as a standard object literal `{ ... }` inheriting from `Object.prototype`.
  When a client submits `category: "__proto__"`, `CATEGORY_MAP['__proto__']` resolves to `Object.prototype` (a truthy object).
  The validation condition `!CATEGORY_MAP[category.toLowerCase().trim()]` evaluates to `false`, bypassing category verification.
  Subsequent code at lines 183–198 accesses `categoryMeta.id`, which is `undefined`.
  `server/db/database.js` defaults missing category strings to empty strings:
  ```javascript
  const category = typeof jobData.category === 'string' ? jobData.category.trim() : '';
  ```
  The endpoint creates and persists a corrupt job with empty category fields:
  ```json
  {
    "id": "13bef6db-4aac-4c12-9a73-c5579e3aefd9",
    "category": "",
    "categorySlug": "",
    "categoryName": "",
    "status": "open"
  }
  ```
- **Response**: HTTP 201 Created (expected HTTP 400 Bad Request).
- **Harness Failure**: `F6.proto___proto__` and `F10.3` failed.

#### 1.4 Negative Budgets Accepted via Object Ranges and Negative Strings
- **Target File**: `server/controllers/jobController.js`
- **Lines 142 & 146–161**:
  ```javascript
  if (typeof budget === 'string' && budget.trim().length > 0) {
    formattedBudget = budget.trim();
  } else if (typeof budget === 'number' && !isNaN(budget) && budget > 0) {
    formattedBudget = `$${budget}`;
  } else if (typeof budget === 'object' && budget !== null) {
    const min = budget.min !== undefined ? Number(budget.min) : undefined;
    const max = budget.max !== undefined ? Number(budget.max) : undefined;
    ...
    if (min !== undefined && max !== undefined && min > max) {
      return res.status(400).json({
        success: false,
        error: 'Invalid budget range: minimum cannot exceed maximum.'
      });
    }
  ```
- **Observed Behavior**:
  - While negative primitive numbers (e.g. `budget: -500`) are rejected with HTTP 400 due to `budget > 0`, object ranges with negative values (e.g. `budget: { min: -500, max: -100 }` or `{ min: -500 }`) only check `min > max` (`-500 > -100` is false).
  - The endpoint accepts the request with HTTP 201 Created and persists `budget: "$-500 - $-100"`.
  - Negative numeric strings (e.g. `budget: "-500"`) pass `typeof budget === 'string' && budget.trim().length > 0` and are persisted as `budget: "-500"` with HTTP 201 Created.
- **Harness Failure**: `F4.11` and `F4.12` failed.

#### 1.5 Passing Suites Summary
The remaining 119 adversarial checks passed completely:
- **Malformed JSON Bodies**: Unterminated strings, trailing commas, nulls, array payloads, raw numbers/booleans cleanly return HTTP 400 Bad Request with zero server crashes.
- **Missing Required Keys**: Omission of title, description, location, urgency, or category cleanly returns HTTP 400 Bad Request.
- **String Boundary & DoS Protection**: Empty and whitespace-only strings for title, description, and location return 400 Bad Request. Payload over 100KB is rejected by Express body parser with HTTP 413 Payload Too Large.
- **Urgency Validation**: Non-whitelisted urgencies (`CRITICAL`, `super-urgent`, `yesterday`, etc.) and non-string urgency types return 400 Bad Request.
- **Invalid Category Rejection**: `cat-0`, `cat-13`, `cat-999`, and unknown string categories return 400 Bad Request. Legitimate category slug `constructor` correctly maps to `cat-5` (Constructor) with HTTP 201.
- **SQL / NoSQL / XSS Injection**:
  - SQL injection payloads (`'; DROP TABLE jobs; -- ' OR '1'='1`)
  - XSS payloads (`<script>alert(1)</script>`, `<img src=x onerror=...>`)
  - NoSQL string payloads (`{"$where": "this.status == 1"}`)
  Are safely stored as inert text strings and retrieved without script execution or database corruption. NoSQL object injections (`{ title: { "$gt": "" } }`) are rejected with HTTP 400 Bad Request.
- **ID Parameter Fuzzing**: Path traversal (`..%2F..%2Fetc%2Fpasswd`), null bytes, script tags, and 5KB strings in `/api/jobs/:id` cleanly return HTTP 404 Not Found without crashes.
- **PATCH Immutability**: Attempts to tamper with `id`, `customerId`, `userId`, `customerName`, `customerEmail`, and `createdAt` via `PATCH /api/jobs/:id` are completely ignored, keeping existing record metadata pristine.

---

## 2. Logic Chain

1. **Requirement R1 & User Mandate Violation**: The user request explicitly demands:
   - "Verify all are handled gracefully (returning 400 Bad Request, never 500 crash)."
   - "Invalid category identifiers (not in cat-1..cat-12)."
   - "Negative or non-numeric budgets."
2. **Defect Causality (500 Crashes)**:
   - In `getJobs`, lines 244, 259, and 265 defensively check `typeof field === 'string'` before calling string methods (`category`, `urgency`, `location`).
   - However, lines 237 (`status`) and 271 (`sort`) perform no type check, blindly calling `.toLowerCase()` on `req.query[field]`.
   - When a client supplies duplicate parameters (`?sort=newest&sort=oldest`), Express parses them into an Array, triggering an unhandled `TypeError` that results in an HTTP 500 crash.
3. **Defect Causality (Category Prototype Bypass)**:
   - In `createJob` (line 109) and `updateJob` (line 376), `!CATEGORY_MAP[category.toLowerCase().trim()]` relies on property lookup across the prototype chain.
   - For `__proto__`, the lookup yields `Object.prototype` (truthy), allowing an invalid category to bypass validation and corrupt database records with empty category fields.
4. **Defect Causality (Negative Budget Bypass)**:
   - While primitive numbers are checked for `budget > 0` in line 144, lines 147–161 for objects fail to enforce `min >= 0` and `max >= 0`.
   - Line 142 fails to validate numeric positivity for string budget inputs, permitting negative budget jobs to be posted.

---

## 3. Caveats

- **Constructor Slug Legitimacy**: In `js/data/categories.js`, category `cat-5` has `name: "Constructor"` and `slug: "constructor"`. Therefore, `category: "constructor"` resolving to `cat-5` is legitimate domain behavior, not a prototype pollution bug. Only `__proto__` represents an invalid prototype property bypass.
- **Baseline Test Suite Status**: `tests/verify-jobs.js` (34/34 passing) only checks happy paths, single query parameters, and specific invalid inputs (`cat-999`, missing fields). It lacks fuzzing coverage for duplicate query parameters, prototype keys, and negative object budgets.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone M1 cannot be approved in its current state due to:
1. **Critical High-Severity Denial of Service / Crash**: HTTP 500 Internal Server Error crashes on `GET /api/jobs` when duplicate `sort` or `status` parameters are present (`sort.toLowerCase is not a function`).
2. **Validation Integrity Defect**: Prototype property `__proto__` bypassing category validation on both `POST /api/jobs` and `PATCH /api/jobs/:id`, persisting corrupted records with empty category strings.
3. **Business Logic Validation Defect**: Negative budgets being accepted with HTTP 201 Created when formatted as objects (`{ min: -500, max: -100 }`) or negative strings (`"-500"`).

### Recommended Remediations for Worker:
1. **Fix `GET /api/jobs` query parameter type guards** in `server/controllers/jobController.js`:
   ```javascript
   const targetStatus = (typeof status === 'string' && status.trim()) ? status.toLowerCase().trim() : 'open';
   const sortType = (typeof sort === 'string' && sort.trim()) ? sort.toLowerCase().trim() : 'newest';
   ```
2. **Fix `CATEGORY_MAP` prototype security** in `server/controllers/jobController.js`:
   Replace `!CATEGORY_MAP[...]` with:
   ```javascript
   const normalizedCat = typeof category === 'string' ? category.toLowerCase().trim() : '';
   if (!normalizedCat || !Object.hasOwn(CATEGORY_MAP, normalizedCat)) {
     return res.status(400).json({ success: false, error: 'Valid category (cat-1 to cat-12) is required.' });
   }
   ```
3. **Enforce positive budget boundaries** in `server/controllers/jobController.js`:
   In object budget parsing:
   ```javascript
   if ((min !== undefined && min < 0) || (max !== undefined && max < 0)) {
     return res.status(400).json({ success: false, error: 'Budget values must be positive.' });
   }
   ```
   In string budget parsing, verify that numeric values in the string are positive numbers.

---

## 5. Verification Method

To independently verify these findings and reproduce the exact failures:

1. **Run Full Adversarial Fuzzing Suite**:
   ```powershell
   node tests/adversarial-fuzzing-m1.test.js
   ```
   *Expected Result*: 119 Passed, 6 Failed (`F4.11`, `F4.12`, `F6.proto___proto__`, `F8.1_dup_sort`, `F8.2_dup_status`, `F10.3`).

2. **Direct Reproduction of HTTP 500 on Duplicate Query Parameters**:
   ```powershell
   node -e "
   const http = require('http');
   const express = require('express');
   const app = express();
   app.use('/api/jobs', require('./server/routes/jobs'));
   const s = app.listen(0, async () => {
     const p = s.address().port;
     const r1 = await fetch('http://127.0.0.1:' + p + '/api/jobs?sort=newest&sort=oldest');
     console.log('sort HTTP status:', r1.status);
     const r2 = await fetch('http://127.0.0.1:' + p + '/api/jobs?status=open&status=cancelled');
     console.log('status HTTP status:', r2.status);
     s.close();
   });"
   ```
   *Expected Output*: Both return status `500`.

3. **Direct Reproduction of Category Validation Bypass via `__proto__`**:
   ```powershell
   node -e "
   const c = require('./server/controllers/jobController');
   const req = {
     body: {
       title: 'Test Job Pipe Leak',
       description: 'Plumbing leak under the kitchen sink needs repair.',
       category: '__proto__',
       location: 'New York',
       urgency: 'urgent',
       budget: '$200'
     },
     user: { id: '7c536f7f-fe87-4b40-b638-765c6bf25341', fullName: 'Montashir', email: 'test@example.com' },
     session: { userId: '7c536f7f-fe87-4b40-b638-765c6bf25341' }
   };
   const res = { status: (s) => ({ json: (d) => console.log('HTTP Status:', s, 'Category:', d.job ? d.job.category : d.error) }) };
   c.createJob(req, res);"
   ```
   *Expected Output*: Returns `HTTP Status: 201 Category:` instead of `HTTP Status: 400`.
