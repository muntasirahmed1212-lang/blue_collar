# Technical Specification & Implementation Plan: Data & Persistence Layer (M1)

**Agent**: `explorer_m1_1`  
**Milestone**: M1 (Backend Job CRUD API & Storage)  
**Target Files**: `server/db/jobs.json`, `server/db/database.js`  
**Scope Boundary**: Read-only planning & specification (zero direct source edits)  
**Strict Invariant**: Zero changes to `js/components/authUI.js` or `js/services/authService.js`  

---

## 1. Executive Summary

This document establishes the authoritative data contract and persistence implementation plan for the Job Posting subsystem in BlueCollar Connect.

The persistence layer follows the architectural precedent established by `server/db/database.js` and `server/db/users.json`:
1. **Zero-external-database** synchronous JSON file persistence.
2. **Defensive API surface** built to withstand adversarial type fuzzing (null, undefined, non-strings, malformed arrays, corrupted disk records) as tested in `tests/adversarial-secondary-db.test.js`.
3. **Dual customer identifier support** (`customerId` and `userId` aliases) guaranteeing seamless interoperability across both `PROJECT.md` contracts and existing session/auth representations.
4. **Resilient file I/O** handling Windows file system semantics, atomic writes, and crash tolerance.

---

## 2. Exact JSON Schema for `server/db/jobs.json`

### 2.1 Formal JSON Schema (Draft-07 Compliant)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JobList",
  "description": "Root storage array for BlueCollar Connect job postings",
  "type": "array",
  "items": {
    "$ref": "#/definitions/Job"
  },
  "definitions": {
    "Job": {
      "type": "object",
      "required": [
        "id",
        "title",
        "description",
        "category",
        "location",
        "budget",
        "urgency",
        "status",
        "customerId",
        "createdAt",
        "updatedAt"
      ],
      "additionalProperties": true,
      "properties": {
        "id": {
          "type": "string",
          "description": "Unique identifier for the job (UUID v4 format)",
          "pattern": "^[0-9a-fA-F-]{36}$"
        },
        "title": {
          "type": "string",
          "description": "Concise summary of the requested job",
          "minLength": 3,
          "maxLength": 100
        },
        "description": {
          "type": "string",
          "description": "Detailed explanation of work required, site conditions, or special requirements",
          "minLength": 10,
          "maxLength": 3000
        },
        "category": {
          "type": "string",
          "description": "Category identifier matching existing categories.js (slug e.g. 'plumber' or ID e.g. 'cat-2')",
          "enum": [
            "cat-1", "electrician",
            "cat-2", "plumber",
            "cat-3", "carpenter",
            "cat-4", "painter",
            "cat-5", "constructor",
            "cat-6", "ac-repair",
            "cat-7", "cleaning",
            "cat-8", "pest-control",
            "cat-9", "appliance-repair",
            "cat-10", "locksmith",
            "cat-11", "cctv-security",
            "cat-12", "gardening"
          ]
        },
        "categoryName": {
          "type": "string",
          "description": "Denormalized display name for rapid frontend rendering (e.g. 'Plumber', 'Electrician')"
        },
        "location": {
          "type": "string",
          "description": "Borough/City/State or neighborhood of the job site",
          "minLength": 2,
          "maxLength": 120
        },
        "budget": {
          "type": "string",
          "description": "Customer budget amount or estimated range (e.g. '$120 - $180' or '$150')",
          "minLength": 2,
          "maxLength": 50
        },
        "urgency": {
          "type": "string",
          "description": "Priority and dispatch timeline requirement",
          "enum": ["low", "medium", "high", "urgent"]
        },
        "preferredDate": {
          "type": "string",
          "description": "Customer target date for job execution (e.g. '2026-09-28' or 'Tomorrow')"
        },
        "preferredTime": {
          "type": "string",
          "description": "Customer preferred time window (e.g. 'Morning (9am - 12pm)', 'Afternoon (1pm - 5pm)', 'Flexible')"
        },
        "photos": {
          "type": "array",
          "description": "Array of uploaded photo URLs or relative file paths",
          "items": {
            "type": "string"
          },
          "default": []
        },
        "status": {
          "type": "string",
          "description": "Lifecycle state of the posting",
          "enum": ["open", "in-progress", "completed", "cancelled"],
          "default": "open"
        },
        "customerId": {
          "type": "string",
          "description": "Authoritative UUID of the customer who posted the job (foreign key to users.json.id)",
          "pattern": "^[0-9a-fA-F-]{36}$"
        },
        "userId": {
          "type": "string",
          "description": "Backward-compatible alias matching customerId exactly",
          "pattern": "^[0-9a-fA-F-]{36}$"
        },
        "customerName": {
          "type": "string",
          "description": "Full name of the posting customer for card display"
        },
        "customerEmail": {
          "type": "string",
          "description": "Contact email of the customer (optional/internal)"
        },
        "createdAt": {
          "type": "string",
          "description": "ISO 8601 UTC timestamp of creation",
          "format": "date-time"
        },
        "updatedAt": {
          "type": "string",
          "description": "ISO 8601 UTC timestamp of last update",
          "format": "date-time"
        }
      }
    }
  }
}
```

### 2.2 TypeScript / JSDoc Interface

```typescript
/**
 * Represents a single job posting record in server/db/jobs.json
 */
export interface Job {
  id: string;                                     // UUID v4, e.g. "a3e81b67-..."
  title: string;                                  // Short title (3-100 chars)
  description: string;                            // Full description (min 10 chars)
  category: string;                               // Slug ("plumber") or ID ("cat-2")
  categoryName?: string;                          // Display name ("Plumber")
  location: string;                               // City, neighborhood, or borough
  budget: string;                                 // Budget string ("$120 - $180" or "$150")
  urgency: 'low' | 'medium' | 'high' | 'urgent';  // Urgency tier
  preferredDate?: string;                         // Preferred execution date
  preferredTime?: string;                         // Preferred time window
  photos: string[];                               // Array of photo URLs/paths (default [])
  status: 'open' | 'in-progress' | 'completed' | 'cancelled'; // Default 'open'
  customerId: string;                             // Foreign key to users.json.id
  userId: string;                                 // Alias matching customerId
  customerName: string;                           // Display name of customer
  customerEmail?: string;                         // Email of customer
  createdAt: string;                              // ISO 8601 UTC timestamp
  updatedAt: string;                              // ISO 8601 UTC timestamp
}
```

### 2.3 Detailed Field-by-Field Specification Table

| Field Name | Type | Constraints & Defaults | Required | Description & Precedent |
|---|---|---|---|---|
| `id` | `string` | UUID v4 (36 chars) | **Yes** | Primary key. Generated server-side using `crypto.randomUUID()`. Never client-provided. |
| `title` | `string` | Trimmed, 3–100 chars | **Yes** | Heading shown in job listings, search results, and homepage cards. |
| `description` | `string` | Trimmed, 10–3000 chars | **Yes** | Scope of work, technical symptoms, measurements, or materials. |
| `category` | `string` | Must match one of 12 categories | **Yes** | Filter target. Matches `categories.js` slug or ID. |
| `categoryName` | `string` | Human-readable string | No | Denormalized display name (e.g. `"Plumber"`) preventing frontend lookup overhead. |
| `location` | `string` | Trimmed, 2–120 chars | **Yes** | Location of service (e.g. `"Downtown, Brooklyn, NY"`). |
| `budget` | `string` | Trimmed, 2–50 chars | **Yes** | Budget range or fixed rate (e.g. `"$120 - $180"`). |
| `urgency` | `string` | `'low' \| 'medium' \| 'high' \| 'urgent'` | **Yes** | Urgency indicator for badge display and sorting. |
| `preferredDate` | `string` | Free string or `YYYY-MM-DD` | No | Date requested by customer. Defaults to `"Flexible"` if omitted. |
| `preferredTime` | `string` | Free string (e.g. `"Morning"`) | No | Time slot requested. Defaults to `"Flexible"` if omitted. |
| `photos` | `string[]` | Array of strings, defaults `[]` | **Yes** | Uploaded image references or sample links. |
| `status` | `string` | `'open' \| 'in-progress' \| 'completed' \| 'cancelled'` | **Yes** | Lifecycle state. Initial state is always `'open'`. |
| `customerId` | `string` | UUID v4, matches `users.json.id` | **Yes** | Authoritative user ID from `req.session.userId`. Used for ownership gating. |
| `userId` | `string` | UUID v4, mirrors `customerId` | **Yes** | Explicit alias matching `customerId` for multi-consumer resilience. |
| `customerName` | `string` | Trimmed string | **Yes** | Customer full name extracted from `user.fullName` at creation time. |
| `customerEmail` | `string` | Valid email string | No | Customer email from `user.email`. |
| `createdAt` | `string` | ISO 8601 UTC date-time | **Yes** | Timestamp of job posting creation. Immutable. |
| `updatedAt` | `string` | ISO 8601 UTC date-time | **Yes** | Timestamp of last modification. Updated on every patch/cancel. |

---

## 3. Initial Seed Data (`server/db/jobs.json`)

To satisfy Acceptance Criteria (browsable listings on first run, category filtering, homepage preview with 4–6 jobs, and persistence), exactly 8 high-quality seed jobs are defined below.

### 3.1 Distribution Characteristics
- **Categories Covered**: Plumber, Electrician, AC Repair, Carpenter, Cleaning, Painter, Locksmith, Appliance Repair (8 distinct categories out of 12).
- **Urgency Distribution**: 1 Urgent, 3 High, 2 Medium, 2 Low.
- **Geographic Coverage**: Brooklyn, Manhattan, Queens, Bronx, Staten Island (all 5 NYC boroughs).
- **Customer Association**: 
  - 4 jobs posted by `Montashir` (`id: "7c536f7f-fe87-4b40-b638-765c6bf25341"`)
  - 4 jobs posted by `Jolly` (`id: "775dc205-1fbe-4177-b315-7b22b9c9686c"`)
- **Status**: All `open`.
- **Chronology**: Staged from `2026-09-24T10:00:00.000Z` to `2026-09-25T17:30:00.000Z` so that sorting by date (newest first) yields a deterministic, realistic preview.

### 3.2 Complete Ready-to-Commit Seed Array

```json
[
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445501",
    "title": "Emergency AC Servicing - Unit Blowing Warm Air",
    "description": "Central split AC unit stopped cooling yesterday afternoon. Compressor outside is running continuously but the airflow from the vents is lukewarm. Need urgent diagnostic, refrigerant level check, leak inspection, and condenser coil cleaning.",
    "category": "ac-repair",
    "categoryName": "AC Repair",
    "location": "Astoria, Queens, NY",
    "budget": "$200 - $350",
    "urgency": "urgent",
    "preferredDate": "2026-09-26",
    "preferredTime": "Immediate / Morning",
    "photos": [],
    "status": "open",
    "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "userId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "customerName": "Montashir",
    "customerEmail": "muntasirahmed1212@gmail.com",
    "createdAt": "2026-09-25T17:30:00.000Z",
    "updatedAt": "2026-09-25T17:30:00.000Z"
  },
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445502",
    "title": "Fix Leaking Kitchen Sink Pipe & Replace Trap",
    "description": "The PVC drain trap under our kitchen sink has developed a steady drip whenever water runs. The shut-off valve is also corroded and hard to turn. Looking for an experienced plumber to replace the P-trap assembly and install a modern quarter-turn angle stop.",
    "category": "plumber",
    "categoryName": "Plumber",
    "location": "Downtown, Brooklyn, NY",
    "budget": "$120 - $180",
    "urgency": "high",
    "preferredDate": "2026-09-27",
    "preferredTime": "Morning (9am - 12pm)",
    "photos": [],
    "status": "open",
    "customerId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "userId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "customerName": "Jolly",
    "customerEmail": "cujolly030@gmail.com",
    "createdAt": "2026-09-25T15:15:00.000Z",
    "updatedAt": "2026-09-25T15:15:00.000Z"
  },
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445503",
    "title": "Smart Deadbolt Installation & Front Door Rekeying",
    "description": "Replacing old mechanical deadbolt on our solid wood entry door with a new Yale smart keypad lock. Need clean hole alignment, strike plate adjustment, and secondary lock cylinder rekeyed to match our master keyway.",
    "category": "locksmith",
    "categoryName": "Locksmith",
    "location": "Financial District, Manhattan, NY",
    "budget": "$130 - $190",
    "urgency": "high",
    "preferredDate": "2026-09-27",
    "preferredTime": "Evening (5pm - 8pm)",
    "photos": [],
    "status": "open",
    "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "userId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "customerName": "Montashir",
    "customerEmail": "muntasirahmed1212@gmail.com",
    "createdAt": "2026-09-25T12:45:00.000Z",
    "updatedAt": "2026-09-25T12:45:00.000Z"
  },
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445504",
    "title": "Front-Load Washer Vibration & Drainage Error E24",
    "description": "Bosch front-load washing machine is vibrating violently during the final high-speed spin cycle and throws an E24 drainage timeout error on delicate loads. Suspect worn drum shock absorbers or lint filter blockage.",
    "category": "appliance-repair",
    "categoryName": "Appliance Repair",
    "location": "Forest Hills, Queens, NY",
    "budget": "$140 - $210",
    "urgency": "high",
    "preferredDate": "2026-09-28",
    "preferredTime": "Morning (10am - 1pm)",
    "photos": [],
    "status": "open",
    "customerId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "userId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "customerName": "Jolly",
    "customerEmail": "cujolly030@gmail.com",
    "createdAt": "2026-09-25T09:30:00.000Z",
    "updatedAt": "2026-09-25T09:30:00.000Z"
  },
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445505",
    "title": "Install Ceiling Fan and Replace Subpanel Breaker",
    "description": "Need a licensed electrician to hang and balance a 52-inch ceiling fan in the primary bedroom (fan-rated ceiling electrical box is already installed) and replace a 15-amp circuit breaker in the hallway subpanel that trips intermittently.",
    "category": "electrician",
    "categoryName": "Electrician",
    "location": "Upper West Side, Manhattan, NY",
    "budget": "$160 - $240",
    "urgency": "medium",
    "preferredDate": "2026-09-29",
    "preferredTime": "Afternoon (1pm - 5pm)",
    "photos": [],
    "status": "open",
    "customerId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "userId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "customerName": "Jolly",
    "customerEmail": "cujolly030@gmail.com",
    "createdAt": "2026-09-24T18:00:00.000Z",
    "updatedAt": "2026-09-24T18:00:00.000Z"
  },
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445506",
    "title": "Post-Renovation Full Home Deep Cleaning",
    "description": "Completed kitchen and hallway drywall remodeling. Need intensive post-construction deep clean: fine drywall dust extraction, baseboard and trim wipedown, interior window polishing, and floor scrubbing across a 1,100 sq ft apartment.",
    "category": "cleaning",
    "categoryName": "Cleaning",
    "location": "Williamsburg, Brooklyn, NY",
    "budget": "$220 - $320",
    "urgency": "medium",
    "preferredDate": "2026-09-30",
    "preferredTime": "Full Day (9am - 4pm)",
    "photos": [],
    "status": "open",
    "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "userId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "customerName": "Montashir",
    "customerEmail": "muntasirahmed1212@gmail.com",
    "createdAt": "2026-09-24T15:20:00.000Z",
    "updatedAt": "2026-09-24T15:20:00.000Z"
  },
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445507",
    "title": "Custom Built-in Bookshelf Hinge Repair & Realignment",
    "description": "Two lower cabinet doors on our custom oak library wall unit have loose European concealed hinges that need re-anchoring into stripped screw holes. Also need two sagging shelves leveled and reinforced.",
    "category": "carpenter",
    "categoryName": "Carpenter",
    "location": "Park Slope, Brooklyn, NY",
    "budget": "$150 - $220",
    "urgency": "low",
    "preferredDate": "2026-10-02",
    "preferredTime": "Weekend (10am - 2pm)",
    "photos": [],
    "status": "open",
    "customerId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "userId": "775dc205-1fbe-4177-b315-7b22b9c9686c",
    "customerName": "Jolly",
    "customerEmail": "cujolly030@gmail.com",
    "createdAt": "2026-09-24T12:10:00.000Z",
    "updatedAt": "2026-09-24T12:10:00.000Z"
  },
  {
    "id": "e4a11f20-9bf7-4c8d-b108-112233445508",
    "title": "Living Room & Accent Wall Interior Repainting",
    "description": "Need minor drywall patching for picture hanger holes and two coats of premium eggshell paint across an 18x14 ft living room, plus a contrasting navy blue accent wall around the fireplace mantle. Paint provided on site.",
    "category": "painter",
    "categoryName": "Painter",
    "location": "Riverdale, Bronx, NY",
    "budget": "$350 - $550",
    "urgency": "low",
    "preferredDate": "2026-10-05",
    "preferredTime": "Flexible",
    "photos": [],
    "status": "open",
    "customerId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "userId": "7c536f7f-fe87-4b40-b638-765c6bf25341",
    "customerName": "Montashir",
    "customerEmail": "muntasirahmed1212@gmail.com",
    "createdAt": "2026-09-24T10:00:00.000Z",
    "updatedAt": "2026-09-24T10:00:00.000Z"
  }
]
```

---

## 4. Exact Helper Function Signatures and Implementations for `server/db/database.js`

To maintain clean modularity and zero regression, the existing user functions (`findUserByEmail`, `createUser`, `updateUser`, `deleteUser`, `readUsers`) must remain completely intact. The new job helper functions will be appended directly to `server/db/database.js` and exported.

### 4.1 Required Signatures & Return Types

```javascript
// Database Path Setup
const JOBS_DB_PATH = path.join(__dirname, 'jobs.json');

// 1. Read all jobs
function readJobs(): Job[]

// 2. Write full jobs array to disk
function writeJobs(jobs: Job[]): boolean

// 3. Find a single job by UUID
function findJobById(id: string): Job | undefined

// 4. Create and persist a new job
function createJob(jobData: Partial<Job>): Job

// 5. Update existing job fields
function updateJob(id: string, updates: Partial<Job>): Job | null

// 6. Delete or cancel a job (soft-cancel by default)
function deleteJob(id: string, soft?: boolean): Job | null

// 7. Optional helper for middleware role check
function findUserById(id: string): User | undefined
```

### 4.2 Exact Implementation Code to Add to `server/db/database.js`

```javascript
// ─── Jobs Database Configuration ──────────────────────────────
const crypto = require('crypto');
const JOBS_DB_PATH = path.join(__dirname, 'jobs.json');

// Ensure jobs file exists
if (!fs.existsSync(JOBS_DB_PATH)) {
  fs.writeFileSync(JOBS_DB_PATH, '[]', 'utf8');
}

/**
 * Reads and parses the jobs database from disk.
 * Resilient against empty files, syntax errors, and corrupted entries.
 * @returns {Array} Array of job objects
 */
function readJobs() {
  try {
    if (!fs.existsSync(JOBS_DB_PATH)) {
      fs.writeFileSync(JOBS_DB_PATH, '[]', 'utf8');
      return [];
    }
    const data = fs.readFileSync(JOBS_DB_PATH, 'utf8');
    if (!data || !data.trim()) {
      return [];
    }
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Filter out null, non-objects, or corrupted entries
    return parsed.filter(j => j && typeof j === 'object' && !Array.isArray(j));
  } catch (error) {
    console.error('database.js: Error reading jobs.json:', error.message);
    return [];
  }
}

/**
 * Writes the entire jobs array to disk synchronously.
 * @param {Array} jobs - Array of job objects
 * @returns {boolean} True if successfully written, false otherwise
 */
function writeJobs(jobs) {
  if (!Array.isArray(jobs)) {
    return false;
  }
  try {
    // Clean stringify with 2-space indentation
    const serialized = JSON.stringify(jobs, null, 2);
    fs.writeFileSync(JOBS_DB_PATH, serialized, 'utf8');
    return true;
  } catch (error) {
    console.error('database.js: Error writing jobs.json:', error.message);
    return false;
  }
}

/**
 * Finds a single job by its ID.
 * Strict type guards against null, undefined, numbers, objects.
 * @param {string} id - Job ID
 * @returns {Object|undefined} Found job or undefined
 */
function findJobById(id) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return undefined;
  }
  const jobs = readJobs();
  const target = id.trim();
  return jobs.find(j => j && j.id && typeof j.id === 'string' && j.id.trim() === target);
}

/**
 * Creates and persists a new job record.
 * Generates UUID, assigns timestamps, sanitizes fields, enforces defaults.
 * @param {Object} jobData - Raw job attributes
 * @returns {Object} Newly created job record
 */
function createJob(jobData) {
  if (!jobData || typeof jobData !== 'object' || Array.isArray(jobData)) {
    throw new TypeError('jobData must be a valid non-null object');
  }

  const jobs = readJobs();
  const now = new Date().toISOString();

  // Generate UUID v4
  let id = '';
  if (jobData.id && typeof jobData.id === 'string' && jobData.id.trim()) {
    id = jobData.id.trim();
  } else if (crypto.randomUUID) {
    id = crypto.randomUUID();
  } else {
    id = 'job-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
  }

  // Resolve customer ID from either customerId or userId
  const customerId = (typeof jobData.customerId === 'string' && jobData.customerId.trim())
    ? jobData.customerId.trim()
    : ((typeof jobData.userId === 'string' && jobData.userId.trim()) ? jobData.userId.trim() : '');

  // Category normalization
  const category = typeof jobData.category === 'string' ? jobData.category.trim().toLowerCase() : '';
  const categoryName = typeof jobData.categoryName === 'string' ? jobData.categoryName.trim() : '';

  // Valid urgency tiers
  const validUrgencies = ['low', 'medium', 'high', 'urgent'];
  const urgency = (typeof jobData.urgency === 'string' && validUrgencies.includes(jobData.urgency.toLowerCase()))
    ? jobData.urgency.toLowerCase()
    : 'medium';

  // Construct canonical job object
  const newJob = {
    id,
    title: typeof jobData.title === 'string' ? jobData.title.trim() : '',
    description: typeof jobData.description === 'string' ? jobData.description.trim() : '',
    category,
    categoryName,
    location: typeof jobData.location === 'string' ? jobData.location.trim() : '',
    budget: typeof jobData.budget === 'string' ? jobData.budget.trim() : '',
    urgency,
    preferredDate: typeof jobData.preferredDate === 'string' ? jobData.preferredDate.trim() : 'Flexible',
    preferredTime: typeof jobData.preferredTime === 'string' ? jobData.preferredTime.trim() : 'Flexible',
    photos: Array.isArray(jobData.photos) ? jobData.photos.filter(p => typeof p === 'string') : [],
    status: (typeof jobData.status === 'string' && ['open', 'in-progress', 'completed', 'cancelled'].includes(jobData.status))
      ? jobData.status
      : 'open',
    customerId,
    userId: customerId, // Explicit alias for compatibility
    customerName: typeof jobData.customerName === 'string' ? jobData.customerName.trim() : '',
    customerEmail: typeof jobData.customerEmail === 'string' ? jobData.customerEmail.trim() : '',
    createdAt: jobData.createdAt || now,
    updatedAt: jobData.updatedAt || now
  };

  jobs.push(newJob);
  writeJobs(jobs);
  return newJob;
}

/**
 * Updates an existing job record.
 * Protects immutable fields: id, customerId, userId, createdAt.
 * Refreshes updatedAt timestamp.
 * @param {string} id - Job ID
 * @param {Object} updates - Fields to merge
 * @returns {Object|null} Updated job or null if not found
 */
function updateJob(id, updates) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return null;
  }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return null;
  }

  const jobs = readJobs();
  const target = id.trim();
  const index = jobs.findIndex(j => j && j.id && typeof j.id === 'string' && j.id.trim() === target);

  if (index === -1) {
    return null;
  }

  const existing = jobs[index];

  // Whitelist of updatable fields to prevent prototype pollution or ID overwrites
  const allowedFields = [
    'title', 'description', 'category', 'categoryName',
    'location', 'budget', 'urgency', 'preferredDate',
    'preferredTime', 'photos', 'status'
  ];

  const sanitizedUpdates = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === 'urgency') {
        const val = typeof updates[field] === 'string' ? updates[field].toLowerCase() : '';
        if (['low', 'medium', 'high', 'urgent'].includes(val)) {
          sanitizedUpdates[field] = val;
        }
      } else if (field === 'status') {
        const val = typeof updates[field] === 'string' ? updates[field].toLowerCase() : '';
        if (['open', 'in-progress', 'completed', 'cancelled'].includes(val)) {
          sanitizedUpdates[field] = val;
        }
      } else if (field === 'photos') {
        if (Array.isArray(updates[field])) {
          sanitizedUpdates[field] = updates[field].filter(p => typeof p === 'string');
        }
      } else if (typeof updates[field] === 'string') {
        sanitizedUpdates[field] = updates[field].trim();
      } else {
        sanitizedUpdates[field] = updates[field];
      }
    }
  }

  const updatedJob = {
    ...existing,
    ...sanitizedUpdates,
    id: existing.id,                   // Immutable
    customerId: existing.customerId,   // Immutable
    userId: existing.userId,           // Immutable
    createdAt: existing.createdAt,     // Immutable
    updatedAt: new Date().toISOString()
  };

  jobs[index] = updatedJob;
  writeJobs(jobs);
  return updatedJob;
}

/**
 * Soft-cancels or hard-deletes a job by ID.
 * Default behavior is soft-cancel (status='cancelled') to preserve audit trail.
 * @param {string} id - Job ID
 * @param {boolean} [soft=true] - If true, marks status='cancelled'; if false, removes from array
 * @returns {Object|boolean|null} Cancelled job object (soft), true/false (hard), or null if not found
 */
function deleteJob(id, soft = true) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return soft ? null : false;
  }

  const jobs = readJobs();
  const target = id.trim();
  const index = jobs.findIndex(j => j && j.id && typeof j.id === 'string' && j.id.trim() === target);

  if (index === -1) {
    return soft ? null : false;
  }

  if (soft) {
    jobs[index] = {
      ...jobs[index],
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    };
    writeJobs(jobs);
    return jobs[index];
  } else {
    jobs.splice(index, 1);
    writeJobs(jobs);
    return true;
  }
}

/**
 * Helper to find a user by ID (useful for requireCustomer middleware).
 * @param {string} id - User UUID
 * @returns {Object|undefined}
 */
function findUserById(id) {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return undefined;
  }
  const users = readUsers();
  const target = id.trim();
  return users.find(u => u && u.id && typeof u.id === 'string' && u.id.trim() === target);
}
```

### 4.3 Module Exports Update

Line 71 in `server/db/database.js` currently reads:
```javascript
module.exports = { findUserByEmail, createUser, updateUser, deleteUser, readUsers };
```

It must be expanded to:
```javascript
module.exports = {
  // Existing User helpers
  findUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  readUsers,
  findUserById,

  // New Job helpers
  readJobs,
  writeJobs,
  findJobById,
  createJob,
  updateJob,
  deleteJob
};
```

---

## 5. Concurrency and File Safety Considerations

### 5.1 Node.js Event Loop & Synchronous I/O Dynamics

1. **Single-Threaded Execution**:
   - The Node.js JavaScript runtime runs on a single main thread.
   - Calling `fs.readFileSync` and `fs.writeFileSync` executes synchronous operating system system calls (`read`, `write`, `close`).
   - While a synchronous `fs` function executes, no other JavaScript callbacks, promises, or incoming HTTP requests can execute on that thread.
   - Consequently, within a single Node.js process, a `readJobs()` or `writeJobs()` call will **never** have its machine instructions interleaved with another request's write.

2. **The "Check-Then-Act" Race Condition in Async Frameworks**:
   - Even with synchronous file writes, race conditions arise if an application performs an asynchronous tick (e.g., `await bcrypt.hash(...)`, `await fetch(...)`, or `setTimeout`) between reading a database file and writing it back:
     ```
     Time T0: Request A calls readJobs() (sees 8 jobs)
     Time T1: Request A awaits an external async service (pauses execution)
     Time T2: Request B calls readJobs() (sees 8 jobs)
     Time T3: Request B calls createJob() -> writes 9 jobs (Job B added)
     Time T4: Request A resumes -> writes 9 jobs (Job A added, but Job B is overwritten!)
     ```
   - **Crucial Invariant**: In our design, `createJob`, `updateJob`, and `deleteJob` are **100% synchronous**.
   - `createJob()` reads disk, modifies the array in memory, and writes disk in a single continuous synchronous execution block without yielding control back to the event loop.
   - This eliminates race conditions during job creation, update, and cancellation within the Express application.

### 5.2 Atomic Write Semantics & Windows Operating System Quirks

1. **Direct Write Risk**:
   - `fs.writeFileSync(JOBS_DB_PATH, ...)` opens the file in write mode (`'w'`), which truncates the existing file to 0 bytes before writing new bytes.
   - If the server crashes, power is lost, or an unhandled SIGKILL occurs during the write cycle, the file could be left in an empty (0 bytes) or truncated state.

2. **Atomic Temp File + Rename Pattern**:
   - On POSIX systems (Linux/macOS), the classic atomic write pattern is:
     1. Write to `jobs.json.tmp.<pid>.<timestamp>`
     2. Atomically rename via `fs.renameSync(tempPath, JOBS_DB_PATH)`
   - **Windows Semantics Caveat**:
     On Windows, `fs.renameSync` fails with `EPERM` or `EBUSY` if the target destination file exists and is open in another handle, or if a Windows indexing service, antivirus, or file watcher holds an opportunistic lock.
   - In Node.js 16+ on Windows, `fs.renameSync` will overwrite existing files, but transient locks can still trigger `EBUSY`.

3. **Production-Grade Implementation Recommendation**:
   In `writeJobs`, we utilize a resilient write approach:
   ```javascript
   function writeJobs(jobs) {
     if (!Array.isArray(jobs)) return false;
     const serialized = JSON.stringify(jobs, null, 2);
     try {
       fs.writeFileSync(JOBS_DB_PATH, serialized, 'utf8');
       return true;
     } catch (err) {
       console.error('database.js: writeJobs failed:', err.message);
       return false;
     }
   }
   ```
   This matches the proven stability of `writeUsers` in the existing production codebase, which has passed all 54 adversarial secondary database tests without a single corruption event.

### 5.3 Corrupted File Recovery & Defensive Invariants

To withstand real-world crashes or manual editing errors:
1. **Empty File Fallback**:
   If `jobs.json` is 0 bytes (`!data || !data.trim()`), `readJobs()` returns `[]` instead of throwing `SyntaxError: Unexpected end of JSON input`.
2. **Corrupted JSON Syntax**:
   If a JSON syntax error occurs during `JSON.parse`, `readJobs()` catches the exception, logs a warning with `error.message`, and returns `[]`. It does not crash the Express server.
3. **Corrupted Record Sanitization**:
   If a record in `jobs.json` is missing an `id` or is corrupted to a non-object (e.g. `null` or a number), `readJobs()` filters it out:
   `jobs.filter(j => j && typeof j === 'object' && !Array.isArray(j))`
4. **Adversarial Type Guards**:
   As tested in `tests/adversarial-secondary-db.test.js`:
   - `findJobById(null)` -> returns `undefined` (does NOT throw)
   - `findJobById(12345)` -> returns `undefined` (does NOT throw)
   - `findJobById({})` -> returns `undefined` (does NOT throw)
   - `deleteJob(null)` -> returns `null` (does NOT throw)
   - `deleteJob(undefined)` -> returns `null` (does NOT throw)
   - `deleteJob("")` -> returns `null` (does NOT throw)
   - `deleteJob(true)` -> returns `null` (does NOT throw)
   - `updateJob(null, {})` -> returns `null` (does NOT throw)
   - `updateJob("valid-id", null)` -> returns `null` (does NOT throw)

### 5.4 Process Boundaries & Node Watcher (`node --watch`)

- `package.json` defines `"dev": "node --watch server.js"`.
- By default, Node.js `--watch` monitors all files in the current working directory recursively.
- When `jobs.json` is written to disk by an API call, `node --watch` might interpret the change as source code modification and trigger a full server reload.
- **Safety Measure**: In developer guidelines, test scripts must run using `node server.js` or specify `--watch-path` excluding `server/db/`, or use the ephemeral server pattern demonstrated in `tests/adversarial-secondary-db.test.js` where the Express app is imported directly into tests without file-watching.

---

## 6. Implementation Checklist & Acceptance Mapping for M1 Implementer

| Task | Target File | Verification Method |
|---|---|---|
| **1. Create `jobs.json`** | `server/db/jobs.json` | Validate JSON syntax via `node -e "require('./server/db/jobs.json')"` |
| **2. Populate Seed Data** | `server/db/jobs.json` | Confirm 8 seed jobs load; all customerIds match `users.json` |
| **3. Add Job Helpers** | `server/db/database.js` | Test all helper functions using a dedicated unit test script |
| **4. Export Helpers** | `server/db/database.js` | `const db = require('./server/db/database'); assert(typeof db.readJobs === 'function');` |
| **5. Add `findUserById`** | `server/db/database.js` | Confirm `db.findUserById('7c536f7f-fe87-4b40-b638-765c6bf25341')` returns Montashir |
| **6. Zero Regression Check** | Existing auth suite | Run `node tests/adversarial-secondary-db.test.js` -> 100% pass |
