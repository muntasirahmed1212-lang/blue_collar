# Technical Analysis & Remediation Design: Defect 1.3 (Prototype Property Category Bypass)

**Agent**: `explorer_m1_fix_2`  
**Role**: Explorer / Security Analyst  
**Date**: 2026-09-25T19:07:00Z  
**Target File**: `server/controllers/jobController.js`  
**Status**: Completed (Ready for Implementation)

---

## 1. Executive Summary

During adversarial fuzzing of Milestone M1 (Post Jobs Feature), `challenger_m1_2` discovered a security and data integrity vulnerability (Defect 1.3):
Passing `category: "__proto__"` in the JSON payload of `POST /api/jobs` or `PATCH /api/jobs/:id` completely bypasses category validation, returning `HTTP 201 Created` (on POST) or `HTTP 200 OK` (on PATCH). This persists corrupted job records into `server/db/jobs.json` with empty strings for `category`, `categorySlug`, and `categoryName`.

This document delivers:
1. A rigorous root-cause analysis explaining the JavaScript prototype traversal mechanics that enable this vulnerability.
2. An analysis of why `category: "constructor"` is legitimate domain behavior (mapping to `cat-5` "Constructor") and must continue to succeed.
3. An evaluation of candidate architectural strategies (`Object.create(null)`, `Object.hasOwn`, whitelist sets).
4. A production-grade Defense-in-Depth remediation design combining null-prototype inheritance (`Object.create(null)`), immutable dictionary freezing (`Object.freeze`), static own-property validation (`Object.hasOwn`), and a centralized lookup helper (`getCategoryMeta`).
5. Precise code changes and patch diffs for `server/controllers/jobController.js`.
6. Independent verification commands and empirical test vectors.

---

## 2. Root Cause Analysis

### 2.1 The Vulnerability Mechanics
In JavaScript, plain object literals inherit from `Object.prototype`:
```javascript
// server/controllers/jobController.js:6-34
const CATEGORY_MAP = {
  'cat-1': { id: 'cat-1', name: 'Electrician', slug: 'electrician' },
  ...
  'constructor': { id: 'cat-5', name: 'Constructor', slug: 'constructor' },
  ...
};
```

In `jobController.js`, category validation was implemented as:
```javascript
// Line 108 (createJob) & Line 376 (updateJob):
if (!category || typeof category !== 'string' || !CATEGORY_MAP[category.toLowerCase().trim()]) {
  return res.status(400).json({
    success: false,
    error: 'Valid category (cat-1 to cat-12) is required.'
  });
}
```

When an attacker or fuzzer submits:
```json
{
  "category": "__proto__"
}
```
1. `category.toLowerCase().trim()` evaluates to the string `"__proto__"`.
2. In V8 (Node.js runtime), bracket property access `CATEGORY_MAP["__proto__"]` invokes the accessor property defined on `Object.prototype.__proto__`.
3. This accessor returns the object's prototype, which is `Object.prototype`.
4. In JavaScript, all objects are truthy (`Boolean(Object.prototype) === true`).
5. Therefore, `!CATEGORY_MAP["__proto__"]` evaluates to `!Object.prototype`, which is `false`.
6. The entire guard condition evaluates to `false`, allowing execution to bypass the `HTTP 400 Bad Request` block.

### 2.2 Downstream Data Corruption
Once past the guard condition:
```javascript
// Line 183:
const categoryMeta = CATEGORY_MAP[category.toLowerCase().trim()];
```
- `categoryMeta` is assigned `Object.prototype`.
- Properties `categoryMeta.id`, `categoryMeta.slug`, and `categoryMeta.name` are looked up on `Object.prototype`, yielding `undefined`.
- At lines 196–198:
  ```javascript
  category: categoryMeta.id,       // undefined
  categorySlug: categoryMeta.slug, // undefined
  categoryName: categoryMeta.name, // undefined
  ```
- In `server/db/database.js` (`createJob`, lines 174–176):
  ```javascript
  const category = typeof jobData.category === 'string' ? jobData.category.trim() : '';
  const categorySlug = typeof jobData.categorySlug === 'string' ? jobData.categorySlug.trim() : category;
  const categoryName = typeof jobData.categoryName === 'string' ? jobData.categoryName.trim() : '';
  ```
- Because `undefined` is not a string, `database.js` defaults these fields to empty strings `""`.
- The database writes a corrupted job record:
  ```json
  {
    "id": "6f09e4a0-32d2-4435-a65b-c2fc36b5155d",
    "category": "",
    "categorySlug": "",
    "categoryName": "",
    "status": "open"
  }
  ```
- The endpoint returns `HTTP 201 Created` with this corrupted record.

In `updateJob` (PATCH /api/jobs/:id), lines 382–385 set `sanitizedUpdates.category = undefined`, ignoring the invalid category, leaving the old category intact, but returning `HTTP 200 OK` instead of rejecting the malicious input with `HTTP 400 Bad Request`.

### 2.3 The Special Status of `category: "constructor"`
The BlueCollar Connect platform defines 12 standard blue-collar categories in `js/data/categories.js`. Category `cat-5` is:
```javascript
{
  id: "cat-5",
  name: "Constructor",
  slug: "constructor",
  ...
}
```
Accordingly, in `CATEGORY_MAP`:
```javascript
'constructor': { id: 'cat-5', name: 'Constructor', slug: 'constructor' }
```
Because `'constructor'` is explicitly defined as an **own property** on `CATEGORY_MAP`:
- `CATEGORY_MAP['constructor']` returns the own property `{ id: 'cat-5', name: 'Constructor', slug: 'constructor' }`, masking `Object.prototype.constructor` (`function Object()`).
- `Object.hasOwn(CATEGORY_MAP, 'constructor')` evaluates to `true`.
- Any category validation redesign **MUST** maintain full support for `category: "constructor"`, mapping it to `cat-5`.

### 2.4 Other Prototype Properties Analysis
We inspected all properties on `Object.prototype`:
```
['constructor', '__defineGetter__', '__defineSetter__', 'hasOwnProperty', '__lookupGetter__',
 '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable', 'toString', 'valueOf',
 '__proto__', 'toLocaleString']
```
When lowercased:
- `toString` -> `"tostring"` (not on `Object.prototype`, returns `undefined`)
- `valueOf` -> `"valueof"` (not on `Object.prototype`, returns `undefined`)
- `hasOwnProperty` -> `"hasownproperty"` (not on `Object.prototype`, returns `undefined`)
- `constructor` -> `"constructor"` (is an own property on `CATEGORY_MAP` -> maps to `cat-5`)
- `__proto__` -> `"__proto__"` (**identically lowercase** -> resolves to `Object.prototype`!)

Relying on casing to prevent prototype resolution is an accidental side effect, not a security boundary. Any prototype property accessed in its native case or on un-lowercased lookups could resolve to a function or object. A robust architecture must eliminate prototype resolution entirely.

---

## 3. Evaluation of Candidate Strategies

| Strategy | Mechanism | Pros | Cons / Risks | Verdict |
|---|---|---|---|---|
| **Option 1: Static `Object.hasOwn` check only** | `if (!Object.hasOwn(CATEGORY_MAP, key))` | Standard ES2022; rejects `__proto__`; accepts `constructor` | `CATEGORY_MAP` still inherits from `Object.prototype`; bracket access elsewhere could still leak prototype properties | Good, but incomplete defense |
| **Option 2: Null prototype `Object.create(null)` only** | `Object.assign(Object.create(null), { ... })` | Severed prototype chain; `map['__proto__'] === undefined`; fast O(1) lookup | If someone later calls `.hasOwnProperty()` on the map, it throws `TypeError: not a function` | High effectiveness, needs proper helper |
| **Option 3: Separate Whitelist `Set`** | `const SET = new Set([...])` | Highly explicit | Redundant duplicate data structure to maintain alongside dictionary | Unnecessary overhead |
| **Option 4: Defense-in-Depth (Recommended)** | `Object.freeze(Object.assign(Object.create(null), ...))` + `Object.hasOwn` + `getCategoryMeta()` helper | 1. Null prototype completely removes `__proto__`<br>2. `Object.freeze` prevents runtime tampering<br>3. `Object.hasOwn` ensures own-property semantics<br>4. Centralized `getCategoryMeta` helper ensures identical validation across POST, GET, PATCH | None | **SELECTED** |

---

## 4. Remediation Design: Defense-in-Depth Architecture

### 4.1 Dictionary Initialization with Null Prototype and Freezing
Initialize `CATEGORY_MAP` using `Object.create(null)` and wrap in `Object.freeze`:
```javascript
const CATEGORY_MAP = Object.freeze(Object.assign(Object.create(null), {
  // Canonical ID mapping (cat-1 to cat-12)
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
```

### 4.2 Centralized Category Resolver Helper
Implement `getCategoryMeta(categoryInput)`:
```javascript
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
```

### 4.3 Endpoint Usage Pattern
All three endpoints in `server/controllers/jobController.js` utilize this helper:

1. **`createJob` (POST /api/jobs)**:
   ```javascript
   // Category validation (cat-1..cat-12 or valid slug)
   const categoryMeta = getCategoryMeta(category);
   if (!categoryMeta) {
     return res.status(400).json({
       success: false,
       error: 'Valid category (cat-1 to cat-12) is required.'
     });
   }
   ```
   At job instantiation (line 196), `categoryMeta` is directly reused without secondary lookup:
   ```javascript
   category: categoryMeta.id,
   categorySlug: categoryMeta.slug,
   categoryName: categoryMeta.name,
   ```

2. **`getJobs` (GET /api/jobs)**:
   ```javascript
   // Filter by category
   if (category && typeof category === 'string' && category.trim()) {
     const catQuery = category.toLowerCase().trim();
     const meta = getCategoryMeta(catQuery);
     const targetCatId = meta ? meta.id : catQuery;
     const targetSlug = meta ? meta.slug : catQuery;
     filtered = filtered.filter(j => { ... });
   }
   ```
   When `category: "__proto__"` is queried, `meta` is `null`, `targetCatId` is `"__proto__"`, and no open jobs match. It returns `HTTP 200` with `[]` rather than resolving to `Object.prototype`.

3. **`updateJob` (PATCH /api/jobs/:id)**:
   ```javascript
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
   ```
   When `updates.category: "__proto__"` is passed, `meta` is `null`, and the endpoint immediately rejects with `HTTP 400 Bad Request`.

---

## 5. Exact Code Changes for `server/controllers/jobController.js`

### Change 1: Update `CATEGORY_MAP` definition and add `getCategoryMeta` helper
**Location**: `server/controllers/jobController.js`, lines 5–35

#### Before:
```javascript
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
```

#### After:
```javascript
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
```

---

### Change 2: Update `createJob` category validation and resolution
**Location**: `server/controllers/jobController.js`, lines 107–113 & line 183

#### Before:
```javascript
    // 2. Category validation (cat-1..cat-12 or valid slug)
    if (!category || typeof category !== 'string' || !CATEGORY_MAP[category.toLowerCase().trim()]) {
      return res.status(400).json({
        success: false,
        error: 'Valid category (cat-1 to cat-12) is required.'
      });
    }
...
    const categoryMeta = CATEGORY_MAP[category.toLowerCase().trim()];
```

#### After:
```javascript
    // 2. Category validation (cat-1..cat-12 or valid slug)
    const categoryMeta = getCategoryMeta(category);
    if (!categoryMeta) {
      return res.status(400).json({
        success: false,
        error: 'Valid category (cat-1 to cat-12) is required.'
      });
    }
...
    // (Line 183 redundant lookup removed; categoryMeta is already defined and validated above)
```

---

### Change 3: Update `getJobs` category query filter resolution
**Location**: `server/controllers/jobController.js`, lines 244–248

#### Before:
```javascript
    // 2. Filter by category
    if (category && typeof category === 'string' && category.trim()) {
      const catQuery = category.toLowerCase().trim();
      const meta = CATEGORY_MAP[catQuery];
      const targetCatId = meta ? meta.id : catQuery;
      const targetSlug = meta ? meta.slug : catQuery;
```

#### After:
```javascript
    // 2. Filter by category
    if (category && typeof category === 'string' && category.trim()) {
      const catQuery = category.toLowerCase().trim();
      const meta = getCategoryMeta(catQuery);
      const targetCatId = meta ? meta.id : catQuery;
      const targetSlug = meta ? meta.slug : catQuery;
```

---

### Change 4: Update `updateJob` category validation and resolution
**Location**: `server/controllers/jobController.js`, lines 375–386

#### Before:
```javascript
    if (updates.category !== undefined) {
      if (typeof updates.category !== 'string' || !CATEGORY_MAP[updates.category.toLowerCase().trim()]) {
        return res.status(400).json({
          success: false,
          error: 'Valid category (cat-1 to cat-12) is required.'
        });
      }
      const meta = CATEGORY_MAP[updates.category.toLowerCase().trim()];
      sanitizedUpdates.category = meta.id;
      sanitizedUpdates.categorySlug = meta.slug;
      sanitizedUpdates.categoryName = meta.name;
    }
```

#### After:
```javascript
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
```

---

## 6. Complete Unified Diff (`jobController.js.patch`)

```diff
--- server/controllers/jobController.js.orig
+++ server/controllers/jobController.js
@@ -3,7 +3,9 @@
 const db = require('../db/database');
 
 // ─── Canonical Category Dictionary ───────────────────────────────────────────
-const CATEGORY_MAP = {
+// Initialized with Object.create(null) and Object.freeze to eliminate prototype pollution
+// and guarantee prototype keys (__proto__, toString, etc.) never resolve to Object.prototype.
+const CATEGORY_MAP = Object.freeze(Object.assign(Object.create(null), {
   // Canonical ID mapping
   'cat-1': { id: 'cat-1', name: 'Electrician', slug: 'electrician' },
   'cat-2': { id: 'cat-2', name: 'Plumber', slug: 'plumber' },
@@ -31,7 +33,26 @@
   'locksmith': { id: 'cat-10', name: 'Locksmith', slug: 'locksmith' },
   'cctv-security': { id: 'cat-11', name: 'CCTV & Security', slug: 'cctv-security' },
   'gardening': { id: 'cat-12', name: 'Gardening', slug: 'gardening' }
-};
+}));
+
+/**
+ * Safely resolves a category identifier or slug to canonical category metadata.
+ * Uses Object.hasOwn and a null-prototype dictionary to prevent prototype key bypasses
+ * (__proto__, toString, etc.), while correctly supporting legitimate 'constructor' category.
+ *
+ * @param {any} cat - Input category ID or slug
+ * @returns {Object|null} Category metadata object { id, name, slug } or null if invalid
+ */
+function getCategoryMeta(cat) {
+  if (!cat || typeof cat !== 'string') {
+    return null;
+  }
+  const key = cat.toLowerCase().trim();
+  if (!key || !Object.hasOwn(CATEGORY_MAP, key)) {
+    return null;
+  }
+  return CATEGORY_MAP[key] || null;
+}
 
 const VALID_URGENCIES = ['low', 'medium', 'high', 'urgent'];
 const VALID_STATUSES = ['open', 'in-progress', 'completed', 'cancelled'];
@@ -105,7 +126,8 @@
     }
 
     // 2. Category validation (cat-1..cat-12 or valid slug)
-    if (!category || typeof category !== 'string' || !CATEGORY_MAP[category.toLowerCase().trim()]) {
+    const categoryMeta = getCategoryMeta(category);
+    if (!categoryMeta) {
       return res.status(400).json({
         success: false,
         error: 'Valid category (cat-1 to cat-12) is required.'
@@ -180,7 +202,6 @@
       });
     }
 
-    const categoryMeta = CATEGORY_MAP[category.toLowerCase().trim()];
     const now = new Date().toISOString();
 
     // Customer info from req.user (attached by requireCustomer)
@@ -243,7 +264,7 @@
     // 2. Filter by category
     if (category && typeof category === 'string' && category.trim()) {
       const catQuery = category.toLowerCase().trim();
-      const meta = CATEGORY_MAP[catQuery];
+      const meta = getCategoryMeta(catQuery);
       const targetCatId = meta ? meta.id : catQuery;
       const targetSlug = meta ? meta.slug : catQuery;
       filtered = filtered.filter(j => {
@@ -373,13 +394,13 @@
     }
 
     if (updates.category !== undefined) {
-      if (typeof updates.category !== 'string' || !CATEGORY_MAP[updates.category.toLowerCase().trim()]) {
+      const meta = getCategoryMeta(updates.category);
+      if (!meta) {
         return res.status(400).json({
           success: false,
           error: 'Valid category (cat-1 to cat-12) is required.'
         });
       }
-      const meta = CATEGORY_MAP[updates.category.toLowerCase().trim()];
       sanitizedUpdates.category = meta.id;
       sanitizedUpdates.categorySlug = meta.slug;
       sanitizedUpdates.categoryName = meta.name;
```

---

## 7. Test Verification & Matrix

The following test matrix validates that all requirements are met:

| Test Case | Input | Expected Status | Expected Result | Reason |
|---|---|---|---|---|
| **TC1** | `category: "__proto__"` (POST) | `400 Bad Request` | Error message returned; no job created | Prototype key rejected by `Object.hasOwn` |
| **TC2** | `category: "__proto__"` (PATCH) | `400 Bad Request` | Error message returned; job not updated | Prototype key rejected by `Object.hasOwn` |
| **TC3** | `category: "constructor"` (POST) | `201 Created` | `job.category === "cat-5"` | Legitimate category slug for "Constructor" |
| **TC4** | `category: "constructor"` (PATCH) | `200 OK` | `job.category === "cat-5"` | Legitimate category slug for "Constructor" |
| **TC5** | `category: "Constructor"` (POST) | `201 Created` | Case-insensitive match to `cat-5` | Correct case normalization |
| **TC6** | `category: "toString"` (POST) | `400 Bad Request` | Error message returned | Prototype key rejected |
| **TC7** | `category: "valueOf"` (POST) | `400 Bad Request` | Error message returned | Prototype key rejected |
| **TC8** | `category: "cat-1"` (POST) | `201 Created` | `job.category === "cat-1"` | Canonical category ID accepted |
| **TC9** | `category: "cat-999"` (POST) | `400 Bad Request` | Error message returned | Unknown category ID rejected |
| **TC10**| `category: ""` (POST) | `400 Bad Request` | Error message returned | Empty string rejected |
| **TC11**| `category: 123` (POST) | `400 Bad Request` | Error message returned | Non-string type rejected |
| **TC12**| `?category=__proto__` (GET) | `200 OK` | `jobs: []` (empty array) | Does not crash or match undefined |
| **TC13**| `?category=constructor` (GET) | `200 OK` | Returns `cat-5` jobs | Correctly filters constructor jobs |

---

## 8. Invalidation Conditions & Boundaries

The proposed fix would be invalidated if:
1. `category: "constructor"` were blocked or treated as an invalid prototype key (violating Acceptance Criteria for category `cat-5`).
2. `Object.hasOwn` were called on an environment without Node 16+ (current Node is v24.19.0, fully supported).
3. Plain bracket access `CATEGORY_MAP[key]` remained unguarded on an object inheriting from `Object.prototype`.
