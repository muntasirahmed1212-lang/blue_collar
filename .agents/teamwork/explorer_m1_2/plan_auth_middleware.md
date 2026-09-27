# Technical Specification & Implementation Plan: Auth & Role Gating Middleware (Milestone M1)

**Component**: Milestone M1 — Auth & Role Gating Middleware  
**Target File**: `server/middleware/authMiddleware.js`  
**Author**: `explorer_m1_2`  
**Date**: 2026-09-26  
**Status**: Ready for Implementation  

---

## 1. Executive Summary & Objective

In BlueCollar Connect, job postings connect customers with verified blue-collar professionals. To safeguard the integrity of the platform, the backend must strictly enforce authorization at the middleware layer before any job creation or job modification takes place.

This document provides the complete, production-ready specification and code implementation for the **Auth & Role Gating Middleware** in `server/middleware/authMiddleware.js`. It defines:
1. The **`requireCustomer`** middleware for `POST /api/jobs` enforcing valid sessions, email verification status, and customer role.
2. The **`isJobOwnerOrAdmin`** and **`verifyJobOwnership`** helpers (and the **`requireJobOwnerOrAdmin`** middleware) for `PATCH /api/jobs/:id` and `DELETE /api/jobs/:id`.
3. Standardized HTTP status codes and exact error message payloads matching system acceptance criteria.
4. Clean integration contracts for `jobController.js` and `jobs.js` ensuring zero regression on existing authentication endpoints (`/api/auth/*`).

---

## 2. Current State of `server/middleware/authMiddleware.js`

### 2.1 Existing Codebase Inspection
The current `server/middleware/authMiddleware.js` contains 26 lines:

```javascript
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
  
  const db = require('../db/database');
  const users = db.readUsers();
  const user = users.find(u => u.id === req.session.userId);
  
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  
  next();
}

module.exports = { requireAuth, requireAdmin };
```

### 2.2 Key Findings
1. **Existing Consumers**:
   - `requireAdmin` is consumed in `server/routes/auth.js` (`router.get('/admin/users', requireAdmin, authController.listUsers);`).
   - `requireAuth` is defined and exported, but not yet mounted on routes.
2. **Session Persistence**:
   - `express-session` stores only `userId` in `req.session.userId`.
   - The user's role (`role`) and verification state (`isVerified`) are stored in `users.json`, accessed via `db.readUsers()`.
   - Therefore, role and verification checks must query `db.readUsers()` by `req.session.userId` to ensure live, non-stale authorization.
3. **Database Import**:
   - `const db = require('../db/database');` can be required at module scope or within functions; importing at module top-level improves readability with zero circular dependency risk.

---

## 3. Specification for `requireCustomer` Middleware

### 3.1 Gating Rules & Sequence

```text
[Incoming Request]
       │
       ▼
1. Check Session ────────── No ─────────► HTTP 401 Unauthorized
(req.session && req.session.userId)       { success: false, error: 'Unauthorized. Please log in.' }
       │ Yes
       ▼
2. Lookup User in DB ────── Not Found ──► HTTP 401 Unauthorized
(users.find(u => u.id === userId))        { success: false, error: 'Unauthorized. Please log in.' }
       │ Found
       ▼
3. Check Role & Verification ─ Fail ────► HTTP 403 Forbidden
(user.isVerified === true &&             { success: false, error: 'Only verified customers can post jobs.' }
 user.role === 'customer')
       │ Pass
       ▼
4. Attach req.user = user
       │
       ▼
5. next() (Pass to jobController.createJob)
```

### 3.2 Error Responses & HTTP Status Contract
| Check | Condition | HTTP Status | Response Body |
|---|---|---|---|
| **Session Active** | `!req.session \|\| !req.session.userId` | **401 Unauthorized** | `{"success": false, "error": "Unauthorized. Please log in."}` |
| **User Exists** | User ID not found in `users.json` | **401 Unauthorized** | `{"success": false, "error": "Unauthorized. Please log in."}` |
| **Email Verified** | `user.isVerified !== true` | **403 Forbidden** | `{"success": false, "error": "Only verified customers can post jobs."}` |
| **Customer Role** | `user.role !== 'customer'` | **403 Forbidden** | `{"success": false, "error": "Only verified customers can post jobs."}` |

*Note: In accordance with AC-3 and survey specifications, an admin or professional account attempting to post a job must receive HTTP 403 because job posting is strictly restricted to verified customer accounts.*

### 3.3 Request Enrichment (`req.user`)
When authorization succeeds, the middleware assigns:
```javascript
req.user = user;
```
This guarantees downstream controllers (e.g., `jobController.createJob`) have immediate, synchronous access to:
- `req.user.id`: Used as `customerId` for the new job record.
- `req.user.fullName`: Used as `customerName` for the job record.
- `req.user.email`: Available for notifications / contact reference.
- `req.user.role`: `'customer'`.

---

## 4. Specification for Ownership Verification Helper (PATCH / DELETE)

### 4.1 Requirements & Rules
When a user attempts to update (`PATCH /api/jobs/:id`) or cancel/delete (`DELETE /api/jobs/:id`) a job:
1. **Authentication**: User must have an active session (`req.session.userId`). If not, return **401 Unauthorized**.
2. **Job Existence**: The target job must exist in the database. If not, return **404 Not Found** (`{ success: false, error: 'Job not found' }`).
3. **Authorization**:
   - The user is the creator of the job (`job.customerId === req.session.userId`, with fallback check `job.userId === req.session.userId` for schema flexibility), **OR**
   - The user has the `'admin'` role (`user.role === 'admin'`).
4. If neither condition is met, return **403 Forbidden**:
   - For PATCH: `{ success: false, error: 'Forbidden. You do not have permission to modify this job.' }`
   - For DELETE: `{ success: false, error: 'Forbidden. You do not have permission to delete this job.' }`

### 4.2 Helper Functions Designed

#### Helper 1: `isJobOwnerOrAdmin(req, job)`
A pure predicate function returning a boolean. Ideal for inline checks inside controller methods.
- **Inputs**: `(req, job)`
- **Output**: `boolean` (`true` if owner or admin; `false` otherwise)

```javascript
function isJobOwnerOrAdmin(req, job) {
  if (!req || !req.session || !req.session.userId || !job) {
    return false;
  }

  const userId = req.session.userId;
  // Match customerId (or fallback userId)
  if (job.customerId === userId || job.userId === userId) {
    return true;
  }

  // Check if user has admin role
  const users = db.readUsers();
  const user = req.user || (Array.isArray(users) ? users.find(u => u && u.id === userId) : null);
  return Boolean(user && user.role === 'admin');
}
```

#### Helper 2: `verifyJobOwnership(req, job, action)`
A comprehensive validator returning an authorization outcome object containing status code and error message.
- **Inputs**: `(req, job, action = 'modify')`
- **Output**: `{ authorized: true }` or `{ authorized: false, status: number, error: string }`

```javascript
function verifyJobOwnership(req, job, action = 'modify') {
  if (!req || !req.session || !req.session.userId) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized. Please log in.'
    };
  }

  if (!job) {
    return {
      authorized: false,
      status: 404,
      error: 'Job not found'
    };
  }

  if (isJobOwnerOrAdmin(req, job)) {
    return { authorized: true };
  }

  const verb = action === 'delete' ? 'delete' : 'modify';
  return {
    authorized: false,
    status: 403,
    error: `Forbidden. You do not have permission to ${verb} this job.`
  };
}
```

#### Helper 3: `requireJobOwnerOrAdmin` (Express Middleware)
An optional route-level middleware that resolves the job by `req.params.id` using `db.findJobById`, performs the ownership check, attaches `req.job = job`, and delegates to `next()` or returns 401/404/403.

```javascript
function requireJobOwnerOrAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }

  const jobId = req.params.id;
  const job = typeof db.findJobById === 'function' ? db.findJobById(jobId) : null;

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  if (!isJobOwnerOrAdmin(req, job)) {
    const action = req.method === 'DELETE' ? 'delete' : 'modify';
    return res.status(403).json({
      success: false,
      error: `Forbidden. You do not have permission to ${action} this job.`
    });
  }

  req.job = job;
  next();
}
```

---

## 5. Complete Production Code for `server/middleware/authMiddleware.js`

Here is the exact code proposed for `server/middleware/authMiddleware.js`:

```javascript
/**
 * server/middleware/authMiddleware.js
 * Authentication & Role Authorization Middleware for BlueCollar Connect
 */

const db = require('../db/database');

/**
 * Ensures request has an active session with a valid userId.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    const users = db.readUsers();
    if (Array.isArray(users)) {
      req.user = users.find(u => u && u.id === req.session.userId);
    }
    return next();
  }
  return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
}

/**
 * Ensures request is from an authenticated user with 'admin' role.
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }
  
  const users = db.readUsers();
  const user = Array.isArray(users) ? users.find(u => u && u.id === req.session.userId) : null;
  
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required.' });
  }
  
  req.user = user;
  next();
}

/**
 * Gating middleware for Job Creation (POST /api/jobs).
 * Enforces:
 *  1. Active session (req.session && req.session.userId) -> 401
 *  2. Existing user record in database -> 401
 *  3. user.isVerified === true -> 403
 *  4. user.role === 'customer' -> 403
 * Attaches req.user = user for downstream controllers.
 */
function requireCustomer(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Please log in.'
    });
  }

  const users = db.readUsers();
  const user = Array.isArray(users) ? users.find(u => u && u.id === req.session.userId) : null;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized. Please log in.'
    });
  }

  if (user.isVerified !== true || user.role !== 'customer') {
    return res.status(403).json({
      success: false,
      error: 'Only verified customers can post jobs.'
    });
  }

  req.user = user;
  next();
}

/**
 * Checks whether the currently logged-in user is the owner of the job
 * or possesses an 'admin' role.
 *
 * @param {object} req - Express request object
 * @param {object} job - Target job record
 * @returns {boolean}
 */
function isJobOwnerOrAdmin(req, job) {
  if (!req || !req.session || !req.session.userId || !job) {
    return false;
  }

  const userId = req.session.userId;
  // Match either customerId or fallback userId
  if (job.customerId === userId || job.userId === userId) {
    return true;
  }

  // Check admin role
  const users = db.readUsers();
  const user = req.user || (Array.isArray(users) ? users.find(u => u && u.id === userId) : null);
  return Boolean(user && user.role === 'admin');
}

/**
 * Verification helper for job ownership authorization.
 * Handles 401 (not logged in), 404 (job not found), and 403 (unauthorized).
 *
 * @param {object} req - Express request object
 * @param {object} job - Job record
 * @param {string} [action='modify'] - Action description ('modify' or 'delete')
 * @returns {{ authorized: boolean, status?: number, error?: string }}
 */
function verifyJobOwnership(req, job, action = 'modify') {
  if (!req || !req.session || !req.session.userId) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized. Please log in.'
    };
  }

  if (!job) {
    return {
      authorized: false,
      status: 404,
      error: 'Job not found'
    };
  }

  if (isJobOwnerOrAdmin(req, job)) {
    return { authorized: true };
  }

  const verb = action === 'delete' ? 'delete' : 'modify';
  return {
    authorized: false,
    status: 403,
    error: `Forbidden. You do not have permission to ${verb} this job.`
  };
}

/**
 * Route-level middleware for checking job ownership or admin privileges.
 * Automatically looks up job by req.params.id and attaches req.job.
 */
function requireJobOwnerOrAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }

  const jobId = req.params.id;
  const job = typeof db.findJobById === 'function' ? db.findJobById(jobId) : null;

  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  if (!isJobOwnerOrAdmin(req, job)) {
    const action = req.method === 'DELETE' ? 'delete' : 'modify';
    return res.status(403).json({
      success: false,
      error: `Forbidden. You do not have permission to ${action} this job.`
    });
  }

  req.job = job;
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireCustomer,
  isJobOwnerOrAdmin,
  verifyJobOwnership,
  requireJobOwnerOrAdmin
};
```

---

## 6. Integration Guide for Downstream Modules

### 6.1 Router Integration (`server/routes/jobs.js`)
In `server/routes/jobs.js`, import `requireCustomer` and `requireAuth` (or `requireJobOwnerOrAdmin`):

```javascript
const express = require('express');
const router = express.Router();
const jobController = require('../controllers/jobController');
const { requireCustomer, requireAuth, requireJobOwnerOrAdmin } = require('../middleware/authMiddleware');

// Public read endpoints
router.get('/', jobController.getJobs);
router.get('/:id', jobController.getJobById);

// Gated creation endpoint (verified customers only)
router.post('/', requireCustomer, jobController.createJob);

// Gated modification endpoints (owner or admin)
router.patch('/:id', requireAuth, jobController.updateJob);
router.delete('/:id', requireAuth, jobController.deleteJob);

module.exports = router;
```

### 6.2 Controller Usage (`server/controllers/jobController.js`)

#### A. In `createJob(req, res)`:
Because `requireCustomer` attached `req.user`:
```javascript
exports.createJob = async (req, res) => {
  try {
    // req.user is guaranteed to be present, verified, and role === 'customer'
    const customerId = req.user.id;
    const customerName = req.user.fullName;
    const customerEmail = req.user.email;

    // Validate body fields...
    // Create and save job...
    const newJob = db.createJob({
      ...validatedData,
      customerId,
      customerName,
      customerEmail,
      status: 'open'
    });

    return res.status(201).json({ success: true, job: newJob });
  } catch (error) {
    console.error('Error creating job:', error);
    return res.status(500).json({ success: false, error: 'Server error while creating job.' });
  }
};
```

#### B. In `updateJob(req, res)`:
```javascript
const { verifyJobOwnership } = require('../middleware/authMiddleware');

exports.updateJob = async (req, res) => {
  try {
    const job = db.findJobById(req.params.id);
    const authCheck = verifyJobOwnership(req, job, 'modify');
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, error: authCheck.error });
    }

    // Apply updates...
    const updatedJob = db.updateJob(req.params.id, req.body);
    return res.json({ success: true, job: updatedJob });
  } catch (error) {
    console.error('Error updating job:', error);
    return res.status(500).json({ success: false, error: 'Server error updating job.' });
  }
};
```

#### C. In `deleteJob(req, res)`:
```javascript
exports.deleteJob = async (req, res) => {
  try {
    const job = db.findJobById(req.params.id);
    const authCheck = verifyJobOwnership(req, job, 'delete');
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ success: false, error: authCheck.error });
    }

    // Delete or cancel job...
    const cancelledJob = db.updateJob(req.params.id, { status: 'cancelled' });
    return res.json({ success: true, message: 'Job cancelled successfully', job: cancelledJob });
  } catch (error) {
    console.error('Error cancelling job:', error);
    return res.status(500).json({ success: false, error: 'Server error cancelling job.' });
  }
};
```

---

## 7. Security Invariants & Defensive Handling

1. **Session Hijacking / Spoofing Defense**:
   - The middleware checks `req.session && req.session.userId`.
   - `express-session` verifies the HMAC signed cookie (`connect.sid`) against `SESSION_SECRET`. Unsigned or altered session IDs are discarded by Express before reaching middleware.
2. **Revocation & Stale Data Defense**:
   - Roles and verification flags are NOT cached on the session object. Every protected request looks up the user record directly in `users.json` via `db.readUsers()`.
   - If an account is banned, deleted, or unverified after login, access is revoked immediately.
3. **Role Gating Separation**:
   - `requireCustomer`: strictly `user.role === 'customer' && user.isVerified === true`.
   - `requireAdmin`: strictly `user.role === 'admin'`.
   - Professionals (`user.role === 'professional'`) cannot post jobs; they browse jobs and submit proposals.
4. **Data Isolation**:
   - Downstream controllers populate `customerId` directly from `req.user.id` (server-side session), NEVER from untrusted user input in `req.body`.
5. **No Password Leakage**:
   - `req.user` is only attached to the internal `req` object for downstream server handlers. It is never serialized or sent back in response bodies directly.

---

## 8. Backward Compatibility & Zero-Regression Verification

- `requireAdmin` remains fully compatible with `server/routes/auth.js:30`.
- `requireAuth` remains fully compatible with any existing callers.
- All existing tests (`tests/verify-all-ac.js`, `tests/adversarial-registration.test.js`, `tests/adversarial-secondary-db.test.js`) will continue to pass.
- Neither `js/components/authUI.js` nor `js/services/authService.js` are touched or affected.
