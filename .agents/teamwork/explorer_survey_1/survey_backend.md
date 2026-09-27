# Backend Architecture & Data Layer Technical Survey
**Project**: BlueCollar Connect  
**Investigator**: explorer_survey_1  
**Date**: 2026-09-25  
**Workspace**: `c:\Users\munta\Downloads\blue_collar`  
**Target Feature**: "Post Jobs" Full Lifecycle  

---

## 1. Executive Summary & Architectural Overview

BlueCollar Connect is a Node.js web application built on **Express 5.2.1** utilizing a lightweight, zero-external-database architecture. The backend serves both static frontend assets (HTML, CSS, modular ES JavaScript) and dynamic REST API endpoints under `/api/`.

Key architectural characteristics:
- **Runtime & Framework**: Node.js CommonJS (`"type": "commonjs"` in `package.json`), Express 5.2.1 (`server.js`).
- **Data Persistence**: Synchronous JSON file persistence located in `server/db/` (`server/db/database.js` managing `users.json`).
- **Session Management**: Cookie-based server-side session management via `express-session` 1.19.0.
- **Security & Headers**: Helmet 8.3.0 (with `contentSecurityPolicy: false` to allow inline scripts), CORS with origin whitelisting and credentials, global IP rate limiting via `express-rate-limit` 8.7.0.
- **Authentication & Roles**: Session tracks `req.session.userId`. Roles are assigned in the user record (`customer`, `admin`, or `professional`) along with a boolean `isVerified` flag.

The "Post Jobs" feature requires adding job CRUD operations (`/api/jobs`) with strict role-gated access (authenticated, verified customers only for creation, ownership-gated updates/deletions, and public read/filter endpoints), persisted to `server/db/jobs.json`.

---

## 2. `server.js` Architecture & Pipeline Analysis

### 2.1 Middleware Order & Request Pipeline
The request pipeline in `server.js` (lines 1-75) executes in the following sequence:

1. **Environment Initialization** (line 2): `require('dotenv').config();` loads `.env`.
2. **Security Headers** (lines 16-18):
   ```javascript
   app.use(helmet({
     contentSecurityPolicy: false  // Allow inline scripts in existing HTML
   }));
   ```
3. **CORS Configuration** (lines 21-34):
   ```javascript
   const allowedOrigins = [
     'http://localhost:3000',
     'http://127.0.0.1:5500'
   ];
   app.use(cors({
     origin: (origin, callback) => {
       if (!origin || allowedOrigins.includes(origin)) {
         return callback(null, true);
       }
       return callback(new Error('Blocked by CORS policy'));
     },
     credentials: true,
   }));
   ```
4. **Body Parsing** (lines 37-38):
   ```javascript
   app.use(express.json());
   app.use(express.urlencoded({ extended: true }));
   ```
5. **Session Middleware** (lines 41-50):
   ```javascript
   app.use(session({
     secret: process.env.SESSION_SECRET || 'fallback_secret_key',
     resave: false,
     saveUninitialized: false,
     cookie: {
       secure: false,         // Set true in production with HTTPS
       httpOnly: true,
       maxAge: 24 * 60 * 60 * 1000  // 24 hours
     }
   }));
   ```
6. **Global Rate Limiting** (lines 53-58):
   ```javascript
   const globalLimiter = rateLimit({
     windowMs: 15 * 60 * 1000,  // 15 minutes
     max: 100,                  // 100 requests per window
     message: { error: 'Too many requests, please try again later.' }
   });
   app.use('/api/', globalLimiter);
   ```
7. **API Route Mounting** (line 61):
   ```javascript
   app.use('/api/auth', authRoutes);
   ```
8. **Static File Serving** (line 64):
   ```javascript
   app.use(express.static(path.join(__dirname, '.')));
   ```
9. **Catch-All Fallback** (lines 67-69):
   ```javascript
   app.use((req, res) => {
     res.sendFile(path.join(__dirname, 'index.html'));
   });
   ```

### 2.2 Integration Point for Job Routes
In `server.js`, new API routes **must** be mounted immediately after line 61 (`app.use('/api/auth', authRoutes);`) and **before** line 64 (`app.use(express.static(...));`).

```javascript
// ─── API Routes ────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);  // <── Exact integration point
```

If `jobRoutes` were placed after `express.static` or after the catch-all fallback, any `GET /api/jobs` request would be intercepted and return `index.html` instead of JSON.

### 2.3 Static File Serving & `jobs.html`
- `express.static` serves the root workspace directory (`path.join(__dirname, '.')`).
- Placing `jobs.html` in the workspace root makes it directly accessible at `/jobs.html`.
- For clean URL support (e.g. `/jobs` without `.html`), an explicit static route or rewrite `app.get('/jobs', (req, res) => res.sendFile(path.join(__dirname, 'jobs.html')));` can be registered before the catch-all fallback.

---

## 3. Data Layer Analysis (`server/db/`)

### 3.1 Inspection of `server/db/database.js`
`server/db/database.js` manages synchronous JSON file persistence. Currently, it handles `users.json`:
- `DB_PATH`: `path.join(__dirname, 'users.json')`
- Self-initializing:
  ```javascript
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, '[]', 'utf8');
  }
  ```
- File reads: `JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))`
- File writes: `fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2), 'utf8')`

### 3.2 Concurrency, Locking & Async Patterns
- **No external DB**: Uses native Node.js `fs` module.
- **Synchronous Operations**: `readFileSync` and `writeFileSync` are blocking calls. In Node.js's single-threaded event loop, synchronous file writes within a single process prevent interleaved write corruption.
- **Process Boundaries**: Multiple independent Node processes writing simultaneously would have a race condition, but for the standard single-server deployment (`node server.js`), synchronous operations provide simple, predictable atomic file writes.
- **Defensive Type Checking**: The existing `database.js` contains rigorous defensive type guards (protecting against `null`, `undefined`, non-string types, and trimming/case-folding emails).

### 3.3 User Data Schema in `users.json`
Verified from `server/db/users.json`:
```json
{
  "id": "7c536f7f-fe87-4b40-b638-765c6bf25341",
  "fullName": "Montashir",
  "email": "muntasirahmed1212@gmail.com",
  "password": "$2b$12$T43cBWQ6UlIJhAHmfrNkZO9e7aRHfZymgPhdjdNV5ox65RfRRcyJ6",
  "role": "customer",
  "isVerified": true,
  "createdAt": "2026-09-24T18:12:57.565Z",
  "updatedAt": "2026-09-24T18:12:57.565Z"
}
```
Existing seed accounts include:
- `muntasirahmed1212@gmail.com`: verified customer (`role: "customer"`, `isVerified: true`)
- `cujolly030@gmail.com`: verified customer (`role: "customer"`, `isVerified: true`)
- `otp.bluecollar@gmail.com`: admin (`role: "admin"`, `isVerified: true`)

### 3.4 Job Persistence Architecture (`server/db/jobs.json`)
To meet acceptance criteria ("Job data persists across server restarts"):
- A dedicated JSON file: `server/db/jobs.json`.
- File initialization: Auto-create `jobs.json` with an empty array `[]` (or initial seed jobs) if it does not exist.
- Data access functions: Either extend `database.js` or create a clean `server/db/jobDatabase.js` (re-exported or cleanly separated) with the following CRUD methods:
  - `readJobs()`: returns array of jobs from `jobs.json`
  - `writeJobs(jobs)`: writes array to `jobs.json` with `JSON.stringify(jobs, null, 2)`
  - `findJobById(id)`: returns job object matching ID
  - `createJob(jobData)`: assigns UUID and timestamps, pushes to array, writes to disk
  - `updateJob(id, updates)`: updates fields, updates `updatedAt`, writes to disk
  - `deleteJob(id)`: removes or marks status as `'cancelled'`, writes to disk

### 3.5 Job Data Schema Specification
Each job record in `jobs.json` must conform to:
```typescript
interface Job {
  id: string;               // UUID, e.g. "job-7c536f7f-..." or standard UUID
  title: string;            // e.g. "Kitchen Sink Pipe Leak Repair"
  description: string;      // Detailed description of the issue/task
  category: string;         // Category ID or slug, e.g. "cat-2" or "plumber"
  categoryName?: string;    // Display name, e.g. "Plumber"
  location: string;         // e.g. "Brooklyn, NY"
  budget: string;           // e.g. "$120 - $180" or "$150"
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  preferredDate?: string;   // e.g. "2026-10-05" or "Tomorrow"
  preferredTime?: string;   // e.g. "Morning (9am - 12pm)"
  photos: string[];         // Array of image URLs/paths (can be empty [])
  status: 'open' | 'in-progress' | 'completed' | 'cancelled';
  userId: string;           // ID of the posting customer (req.session.userId)
  customerName: string;     // Full name of customer for display
  customerEmail?: string;   // Contact email (optional)
  createdAt: string;        // ISO 8601 string
  updatedAt: string;        // ISO 8601 string
}
```

---

## 4. Server-Side Authentication & Session Tracking

### 4.1 How `req.session` is Populated
- In `server.js`, `express-session` handles session cookies (`connect.sid`).
- When a user logs in (`authController.login` line 179) or completes OTP registration (`authController.verifyOtp` line 139):
  ```javascript
  req.session.userId = user.id;
  ```
- **Crucial Observation**: `req.session` stores **only** `userId` (and temporarily `otpData` during OTP verification/reset). It does **NOT** cache `role` or `isVerified` on the session object itself.

### 4.2 How Verification Status and Role are Checked
Because roles and verification status can change or be revoked, the server checks the authoritative database record on every protected request.

Inspection of existing `server/middleware/authMiddleware.js`:
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
```

### 4.3 Proposed `requireCustomer` Middleware
To fulfill Acceptance Criteria:
- Unauthenticated user → **HTTP 401**
- Non-customer or unverified user → **HTTP 403**

```javascript
function requireCustomer(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
  }

  const db = require('../db/database');
  const users = db.readUsers();
  const user = users.find(u => u.id === req.session.userId);

  if (!user) {
    return res.status(401).json({ success: false, error: 'User not found. Please log in again.' });
  }

  if (!user.isVerified || user.role !== 'customer') {
    return res.status(403).json({ 
      success: false, 
      error: 'Forbidden. Only verified customers can post jobs.' 
    });
  }

  req.user = user; // Attach full user object for controller use
  next();
}
```

### 4.4 Job Modification / Deletion Authorization
For `PATCH /api/jobs/:id` and `DELETE /api/jobs/:id`:
1. Check `req.session.userId` (401 if missing).
2. Fetch job by `:id` (404 if not found).
3. Verify ownership: `job.userId === req.session.userId` (or allow `role === 'admin'`).
4. If not owner: return **HTTP 403** (`{ success: false, error: 'Forbidden. You do not have permission to modify this job.' }`).

---

## 5. Existing API Standards & Conventions

### 5.1 Response Structure
Across `authController.js` and all existing endpoints, API responses adhere to strict JSON conventions:

**Success Responses**:
- Always include `success: true`.
- Return data under descriptive keys:
  - Job creation: `{ success: true, job: { ... } }`
  - Job list: `{ success: true, jobs: [ ... ], count: n }`
  - Single job: `{ success: true, job: { ... } }`
  - Action confirmation: `{ success: true, message: 'Job cancelled successfully.' }`

**Error Responses**:
- Always include `success: false`.
- Error message under `error` key: `{ success: false, error: 'Specific error explanation.' }`.
- Specific flags when appropriate (e.g. `needsVerification: true`).

### 5.2 HTTP Status Code Matrix
| Status | Scenario | Example Response |
|---|---|---|
| **200 OK** | Successful read, update, or delete | `{ success: true, jobs: [...] }` |
| **201 Created** | Successful creation (or 200) | `{ success: true, job: {...} }` |
| **400 Bad Request** | Missing fields, invalid data | `{ success: false, error: 'Title, category, and budget are required.' }` |
| **401 Unauthorized** | Missing or invalid session cookie | `{ success: false, error: 'Unauthorized. Please log in.' }` |
| **403 Forbidden** | Unverified user, non-customer role, non-owner | `{ success: false, error: 'Forbidden. Only verified customers can post jobs.' }` |
| **404 Not Found** | Job ID does not exist | `{ success: false, error: 'Job not found.' }` |
| **500 Server Error** | Unexpected exception / I/O error | `{ success: false, error: 'Server error processing request.' }` |

### 5.3 Controller Error Handling Pattern
Existing controllers use standard `try/catch` wrapping:
```javascript
exports.someEndpoint = async (req, res) => {
  try {
    // validation & logic
    res.json({ success: true, ... });
  } catch (error) {
    console.error('someEndpoint error:', error);
    res.status(500).json({ success: false, error: 'Server error ...' });
  }
};
```

---

## 6. Exact CRUD Endpoints Specification for Jobs

### 6.1 `POST /api/jobs`
- **Purpose**: Create a new job posting.
- **Auth**: Protected by `requireCustomer` middleware.
- **Request Body**:
  ```json
  {
    "title": "Fix Leaking Bathroom Pipe",
    "description": "Pipe under the bathroom sink is dripping steadily.",
    "category": "cat-2",
    "location": "Downtown, Brooklyn, NY",
    "budget": "$100 - $150",
    "urgency": "high",
    "preferredDate": "2026-10-01",
    "preferredTime": "Morning (9am - 12pm)",
    "photos": []
  }
  ```
- **Validation**:
  - `title`: string, trimmed, non-empty (min 3 chars).
  - `description`: string, trimmed, non-empty (min 10 chars).
  - `category`: must match one of the 12 category IDs or slugs.
  - `location`: string, trimmed, non-empty.
  - `budget`: string, trimmed, non-empty.
  - `urgency`: must be one of `['low', 'medium', 'high', 'urgent']`.
- **Response**:
  - `201 Created`: `{ success: true, job: { ... } }`
  - `400 Bad Request`: `{ success: false, error: '<validation error>' }`
  - `401 Unauthorized`: `{ success: false, error: 'Unauthorized. Please log in.' }`
  - `403 Forbidden`: `{ success: false, error: 'Forbidden. Only verified customers can post jobs.' }`

### 6.2 `GET /api/jobs`
- **Purpose**: Browse and filter job postings.
- **Auth**: None (Public).
- **Query Parameters**:
  - `category`: Filter by category ID (e.g. `cat-1`) or slug (e.g. `electrician`).
  - `urgency`: Filter by urgency (`low`, `medium`, `high`, `urgent`).
  - `location`: Case-insensitive substring match.
  - `status`: Default to `'open'`. If `status=all`, return all statuses.
  - `sort`: `'date'` (default, newest first) or `'budget'` (highest first).
  - `limit`: Integer, limit total returned (useful for homepage preview, e.g. `limit=6`).
- **Response**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "jobs": [ ... ],
      "count": 6
    }
    ```

### 6.3 `GET /api/jobs/:id`
- **Purpose**: Retrieve single job details.
- **Auth**: None (Public).
- **Response**:
  - `200 OK`: `{ success: true, job: { ... } }`
  - `404 Not Found`: `{ success: false, error: 'Job not found.' }`

### 6.4 `PATCH /api/jobs/:id`
- **Purpose**: Update a job posting or change its status (e.g. mark completed/cancelled).
- **Auth**: Protected by `requireAuth` + owner verification (`job.userId === req.session.userId`).
- **Request Body**:
  Fields to update: `title`, `description`, `budget`, `urgency`, `location`, `status`, `preferredDate`, `preferredTime`, `photos`.
- **Response**:
  - `200 OK`: `{ success: true, job: { ... } }`
  - `401 Unauthorized`: `{ success: false, error: 'Unauthorized. Please log in.' }`
  - `403 Forbidden`: `{ success: false, error: 'Forbidden. You do not have permission to modify this job.' }`
  - `404 Not Found`: `{ success: false, error: 'Job not found.' }`

### 6.5 `DELETE /api/jobs/:id`
- **Purpose**: Cancel or delete a job posting.
- **Auth**: Protected by `requireAuth` + owner verification.
- **Response**:
  - `200 OK`: `{ success: true, message: 'Job cancelled successfully.' }`
  - `401 Unauthorized`: `{ success: false, error: 'Unauthorized. Please log in.' }`
  - `403 Forbidden`: `{ success: false, error: 'Forbidden. You do not have permission to cancel this job.' }`
  - `404 Not Found`: `{ success: false, error: 'Job not found.' }`

---

## 7. Package Dependencies & Testing Infrastructure

### 7.1 `package.json` Review
```json
{
  "name": "blue_collar",
  "version": "1.0.0",
  "main": "index.js",
  "directories": {
    "test": "tests"
  },
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "type": "commonjs",
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "cors": "^2.8.6",
    "dotenv": "^18.0.3",
    "express": "^5.2.1",
    "express-rate-limit": "^8.7.0",
    "express-session": "^1.19.0",
    "helmet": "^8.3.0",
    "nodemailer": "^10.0.10"
  }
}
```
All required dependencies for running `server.js` and building the job backend (`express`, `express-session`, `express-rate-limit`, `cors`, `helmet`, `dotenv`, `bcryptjs`) are already installed in `node_modules` and verified.

### 7.2 Testing Infrastructure
Existing tests in `tests/`:
- `tests/verify-all-ac.js`: Comprehensive acceptance criteria verification for auth and database. Executes via `node tests/verify-all-ac.js`.
- `tests/adversarial-registration.test.js`: 21 adversarial registration tests (all passing).
- `tests/adversarial-secondary-db.test.js`: 54 database robustness and security invariant tests (all passing).

Key testing patterns observed:
1. **Zero External Test Frameworks**: Tests run via plain Node.js (`node <file>.js`) using `node:assert/strict`.
2. **Ephemeral Express Test Instance**: Tests spin up an ephemeral HTTP server on random port (`server.listen(0, '127.0.0.1')`).
3. **Database Preservation**: Pristine copies of DB files are buffered before tests and restored on process exit (`process.on('exit', restoreDb)`).
4. **Cookie Handling**: Session cookies (`set-cookie`) are captured from login responses and passed in subsequent `Cookie` headers to test authenticated endpoints.

### 7.3 Recommended Job Verification Test Suite (`tests/verify-jobs.js`)
In accordance with acceptance criteria:
- Create `tests/verify-jobs.js` executable via `node tests/verify-jobs.js`.
- Must test:
  1. `POST /api/jobs` without session returns 401.
  2. `POST /api/jobs` with unverified or non-customer session returns 403.
  3. `POST /api/jobs` with verified customer creates job and returns 201/200 with `{ success: true, job: {...} }`.
  4. `GET /api/jobs` returns open jobs list without authentication.
  5. `GET /api/jobs?category=<catId>` correctly filters jobs by category.
  6. `GET /api/jobs/:id` retrieves individual job details.
  7. `PATCH /api/jobs/:id` by owner updates job; non-owner returns 403.
  8. `DELETE /api/jobs/:id` by owner cancels job; non-owner returns 403.
  9. Persistence test: read directly from `jobs.json` to prove persistence across server restarts.
  10. Regression check: auth endpoints (`/api/auth/me`, `/api/auth/login`) remain 100% operational.

---

## 8. Implementation Roadmap & Downstream Invariants

### 8.1 Files to Create / Modify
| Component | File Path | Action | Description |
|---|---|---|---|
| **Data Store** | `server/db/jobs.json` | Create | Persistent JSON array of jobs, seeded with 6-8 realistic postings. |
| **Data Layer** | `server/db/database.js` | Extend | Add `readJobs`, `writeJobs`, `createJob`, `findJobById`, `updateJob`, `deleteJob`. |
| **Middleware** | `server/middleware/authMiddleware.js` | Extend | Export `requireCustomer` (or `requireVerifiedCustomer`). |
| **Controller** | `server/controllers/jobController.js` | Create | Handlers for `createJob`, `getJobs`, `getJobById`, `updateJob`, `deleteJob`. |
| **Router** | `server/routes/jobs.js` | Create | Express router for `/api/jobs`. |
| **Server Entry** | `server.js` | Modify | Mount `app.use('/api/jobs', jobRoutes);` before static serving. |
| **Test Suite** | `tests/verify-jobs.js` | Create | Automated acceptance test suite. |

### 8.2 Invariants & Constraints Checklist
- [x] **Read-only boundary respected**: No source code was modified during this survey.
- [x] **Forbidden files**: `js/components/authUI.js` and `js/services/authService.js` remain completely untouched.
- [x] **Zero regressions**: All existing 6 acceptance criteria and 75 adversarial tests pass without failure.
- [x] **Persistence guarantee**: All job data will be stored synchronously in `server/db/jobs.json`.
- [x] **Security**: Non-customers and unverified users strictly blocked from creating jobs (403); unauthenticated blocked (401); non-owners blocked from mutating/deleting jobs (403).
