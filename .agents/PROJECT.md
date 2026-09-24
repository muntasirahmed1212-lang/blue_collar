# Project: BlueCollar Connect Registration & OTP Bug Fix

## Architecture
- **Data Persistence Layer (`server/db/database.js`)**: Encapsulates reading and writing to `server/db/users.json`. Exports `findUserByEmail`, `createUser`, `updateUser`, `deleteUser(email)`, and `readUsers()`. Ensures safe JSON parsing and atomic file writes.
- **Controller Layer (`server/controllers/authController.js`)**: Handles HTTP requests for authentication.
  - `register`: Enforces atomic registration: validates payload, verifies email unverified/verified status, prunes unverified stale record with `db.deleteUser`, generates OTP, dispatches OTP email *before* user creation, and persists user to DB only upon successful email dispatch.
  - `forgotPassword`: Eliminates fragile `this` context by directly invoking `exports.sendOtp(req, res)`.
  - `getMe`: Consumes `db.readUsers()` to query user profile from session without direct `fs.readFileSync` calls.
- **Notification Layer (`server/services/emailService.js`)**: Configures nodemailer SMTP transporter and sends branded OTP emails. Throws on transport failures so callers can catch and handle failure atomically.
- **Frontend Layer (`js/components/authUI.js`, `js/services/authService.js`)**: Strict zero-modification zone. Consumes JSON endpoints at `/api/auth/*`.
- **Automated Verification Harness (`tests/`)**: Zero-dependency automated test suites using Node.js built-ins (`node:test`, `node:assert`, global `fetch`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | `db.readUsers()` Export | Public API to read and parse all user records from `users.json` | M1 | ORIGINAL_REQUEST § R2 |
| F02 | `db.deleteUser(email)` | Public API to remove a user record by email (case-insensitive) | M1 | ORIGINAL_REQUEST § R2 |
| F03 | Unverified Stale User Pruning | Deletes existing unverified record when re-registering | M2 | ORIGINAL_REQUEST § R1 |
| F04 | Verified User Registration Conflict | Returns 400 'Email is already registered' when verified | M2 | ORIGINAL_REQUEST § R1 |
| F05 | Email-First Atomic Registration | Sends OTP email *before* creating user; DB stays clean on error | M2 | ORIGINAL_REQUEST § R1 |
| F06 | Broken SMTP 500 Handling | Returns 500 error on SMTP failure without modifying `users.json` | M2 | ORIGINAL_REQUEST § R1, § AC |
| F07 | `forgotPassword` Context Fix | Invokes `sendOtp` without `this` dependency, preventing crash | M2 | ORIGINAL_REQUEST § R2, § AC |
| F08 | `getMe` DB Module Refactor | Replaces raw `fs.readFileSync` with `db.readUsers()` | M2 | ORIGINAL_REQUEST § R2, § AC |
| F09 | Strict Backward Compatibility | Zero changes to `authUI.js` and `authService.js`; identical schemas | M2, M3 | ORIGINAL_REQUEST § R3 |
| F10 | Acceptance Criteria E2E Test Suite | Comprehensive automated tests for all 5 acceptance criteria | M3 | ORIGINAL_REQUEST § AC |
| F11 | Adversarial Hardening (Tier 5) | Stress tests for edge cases, race conditions, case sensitivity | M4 | System Quality & Robustness |
| F12 | Forensic Integrity Audit | Static and runtime verification of genuine implementation | M4 | Integrity Forensics |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Database Layer Extensions | Add `deleteUser(email)` and export `readUsers()` in `server/db/database.js` | none | DONE |
| M2 | Auth Controller Bug Fixes | Atomic registration, fix `forgotPassword` this binding, refactor `getMe` | M1 | DONE |
| M3 | E2E Automated Verification Suite | Build opaque-box automated test suite for all 5 acceptance criteria | M2 | DONE |
| M4 | Adversarial Hardening & Forensic Audit | Challenger adversarial testing (Tier 5) + Forensic Auditor verification | M3 | DONE |

## Interface Contracts

### Contract 1: `server/db/database.js`
```javascript
/**
 * Reads all user records from users.json.
 * @returns {Array<Object>} Array of user objects
 */
function readUsers(): Array<Object>;

/**
 * Deletes a user with the matching email (case-insensitive).
 * @param {string} email
 * @returns {boolean} True if user was found and deleted, false otherwise
 */
function deleteUser(email: string): boolean;

module.exports = {
  findUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  readUsers
};
```

### Contract 2: `POST /api/auth/register`
- **Method**: `POST`
- **Path**: `/api/auth/register`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Responses**:
  - `200 OK`: `{ "success": true, "message": "OTP sent to your email." }`
    - Precondition: `emailService.sendOTPEmail` succeeded.
    - Postcondition: User saved with `isVerified: false`, `req.session.otpData` set.
  - `400 Bad Request`:
    - Missing fields: `{ "success": false, "error": "All fields are required." }`
    - Verified user conflict: `{ "success": false, "error": "Email is already registered." }`
  - `500 Internal Server Error`:
    - SMTP or server failure: `{ "success": false, "error": "Server error during registration." }`
    - Postcondition: `users.json` contains zero additions.

### Contract 3: `POST /api/auth/forgot-password`
- **Method**: `POST`
- **Path**: `/api/auth/forgot-password`
- **Headers**: `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "email": "jane@example.com"
  }
  ```
- **Responses**:
  - `200 OK`:
    - If user exists: `{ "success": true, "message": "OTP sent to your email." }`
    - If user does not exist (anti-enumeration): `{ "success": true, "message": "If the email exists, an OTP has been sent." }`
  - `400 Bad Request`: Missing email `{ "success": false, "error": "Email is required." }`
  - `500 Internal Server Error`: Server failure

### Contract 4: `GET /api/auth/me`
- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Headers**: `Cookie: connect.sid=...`
- **Responses**:
  - `200 OK`:
    ```json
    {
      "success": true,
      "user": {
        "fullName": "Jane Doe",
        "email": "jane@example.com",
        "role": "customer"
      }
    }
    ```
  - `401 Unauthorized`:
    - No active session: `{ "success": false, "error": "Not authenticated" }`
    - User ID in session not in DB: `{ "success": false, "error": "User not found" }`

## Code Layout
- `server/db/database.js`: Data persistence utility (Owned by Milestone 1 Worker).
- `server/controllers/authController.js`: Authentication handlers (Owned by Milestone 2 Worker).
- `server/services/emailService.js`: Nodemailer email integration (Read-only reference).
- `js/components/authUI.js`: Client UI logic (STRICTLY FORBIDDEN TO MODIFY).
- `js/services/authService.js`: Client API transport (STRICTLY FORBIDDEN TO MODIFY).
- `tests/`: Automated test suite and adversarial test scripts (Owned by Milestone 3 & 4 Workers/Challengers).
