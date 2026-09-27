# Technical Analysis & Solution Design: Defect 1.4 (Budget Validation)

**Agent**: `explorer_m1_fix_3`  
**Role**: Explorer / Investigator  
**Target File**: `server/controllers/jobController.js`  
**Defect Reference**: Defect 1.4 from `challenger_m1_2/handoff.md`  
**Date**: 2026-09-25T19:07:00Z  

---

## 1. Executive Summary

Defect 1.4 identified that negative budgets are accepted by `POST /api/jobs` and `PATCH /api/jobs/:id` in `server/controllers/jobController.js` when provided as:
1. **Object ranges with negative values**: e.g., `{ min: -500, max: -100 }` or `{ min: -500 }`. The current code only checks `min > max` (which evaluates `-500 > -100` as `false`) and accepts the job with HTTP 201 Created, persisting `budget: "$-500 - $-100"`.
2. **Negative numeric strings**: e.g., `"-500"`. Any non-empty string passes `typeof budget === 'string' && budget.trim().length > 0` and is accepted with HTTP 201 Created, persisting `budget: "-500"`.

Furthermore, in `PATCH /api/jobs/:id`, budget validation has identical loopholes, permitting negative budgets to be updated onto existing jobs, or silently skipping invalid negative numbers instead of returning HTTP 400 Bad Request.

This document presents a comprehensive, battle-tested budget validation design implementing:
- **Primitive numbers**: Must be finite and `> 0`.
- **Object ranges**: `min` and `max` must be `>= 0` with at least one `> 0`, and `min <= max`.
- **Strings**: Must not contain negative signs indicating negative money, and must represent a valid non-negative amount or range (ranges, single amounts, "Up to" limits, "+" open ranges).

---

## 2. Root Cause Analysis

### 2.1 Creation Endpoint (`createJob`, lines 140–181)

In `server/controllers/jobController.js`:
```javascript
// 6. Budget validation
let formattedBudget = '';
if (typeof budget === 'string' && budget.trim().length > 0) {
  formattedBudget = budget.trim();
} else if (typeof budget === 'number' && !isNaN(budget) && budget > 0) {
  formattedBudget = `$${budget}`;
} else if (typeof budget === 'object' && budget !== null) {
  const min = budget.min !== undefined ? Number(budget.min) : undefined;
  const max = budget.max !== undefined ? Number(budget.max) : undefined;

  if (min !== undefined && isNaN(min)) {
    return res.status(400).json({ success: false, error: 'Budget is required.' });
  }
  if (max !== undefined && isNaN(max)) {
    return res.status(400).json({ success: false, error: 'Budget is required.' });
  }
  if (min !== undefined && max !== undefined && min > max) {
    return res.status(400).json({
      success: false,
      error: 'Invalid budget range: minimum cannot exceed maximum.'
    });
  }

  const cur = budget.currency || '$';
  if (min !== undefined && max !== undefined) {
    formattedBudget = `${cur}${min} - ${cur}${max}`;
  } else if (min !== undefined) {
    formattedBudget = `${cur}${min}+`;
  } else if (max !== undefined) {
    formattedBudget = `Up to ${cur}${max}`;
  } else {
    return res.status(400).json({
      success: false,
      error: 'Budget is required.'
    });
  }
} else {
  return res.status(400).json({
    success: false,
    error: 'Budget is required.'
  });
}
```

#### Flaws Identified:
1. **String Passthrough**: Line 142 checks `typeof budget === 'string' && budget.trim().length > 0`. It performs **zero** validation on the content of the string. Strings such as `"-500"`, `"-500 - -100"`, `"- $50"`, `"$0"`, and `"abc"` are accepted as valid budgets.
2. **Object Range Negative Values**: Line 147–161 parses `min` and `max` into numbers, but only checks `min > max`. If `min` or `max` is negative (e.g. `min: -500, max: -100`), `-500 > -100` is `false`, so it formats `$-500 - $-100` and succeeds.
3. **Zero-Zero Object Range**: If `{ min: 0, max: 0 }` is passed, `min > max` is `false`, formatting `$0 - $0`.
4. **JS Type Coercion Trap**: If `budget.min` is `""`, `false`, `null`, or `[]`, `budget.min !== undefined` is `true`, and `Number(budget.min)` evaluates to `0`, unintentionally accepting invalid types.

### 2.2 Update Endpoint (`updateJob`, lines 430–453)

```javascript
if (updates.budget !== undefined) {
  if (typeof updates.budget === 'string' && updates.budget.trim()) {
    sanitizedUpdates.budget = updates.budget.trim();
  } else if (typeof updates.budget === 'number' && !isNaN(updates.budget) && updates.budget > 0) {
    sanitizedUpdates.budget = `$${updates.budget}`;
  } else if (typeof updates.budget === 'object' && updates.budget !== null) {
    const min = updates.budget.min !== undefined ? Number(updates.budget.min) : undefined;
    const max = updates.budget.max !== undefined ? Number(updates.budget.max) : undefined;
    if (min !== undefined && max !== undefined && min > max) {
      return res.status(400).json({
        success: false,
        error: 'Invalid budget range: minimum cannot exceed maximum.'
      });
    }
    const cur = updates.budget.currency || '$';
    if (min !== undefined && max !== undefined) {
      sanitizedUpdates.budget = `${cur}${min} - ${cur}${max}`;
    } else if (min !== undefined) {
      sanitizedUpdates.budget = `${cur}${min}+`;
    } else if (max !== undefined) {
      sanitizedUpdates.budget = `Up to ${cur}${max}`;
    }
  }
}
```

#### Flaws Identified:
1. Suffers from the exact same negative object range and negative string bypass as `createJob`.
2. If `updates.budget` is an invalid number (e.g., `-500` or `0`), it does not return HTTP 400; instead it falls through all branches and silently ignores the invalid update, which violates API contract expectations.

---

## 3. Specification for Complete Budget Validation

### 3.1 Primitive Numbers
- Type: `typeof budget === 'number'`.
- Must satisfy: `!isNaN(budget) && Number.isFinite(budget) && budget > 0`.
- Violations: `0`, `-500`, `-0.01`, `NaN`, `Infinity`, `-Infinity` -> Return HTTP 400 (`'Budget values must be positive.'` or `'Budget must be greater than zero.'`).
- Valid formatting: `$${budget}`.

### 3.2 Object Ranges
- Type: `typeof budget === 'object' && budget !== null && !Array.isArray(budget)`.
- Keys: `min`, `max`, `currency` (optional, default `'$'`).
- Both `min` and `max` absent / undefined / empty -> Return HTTP 400 (`'Budget is required.'`).
- Numeric parsing: Numbers or non-empty numeric strings (e.g. `'500'` or `'$500'`). Booleans, arrays, empty strings, and non-numeric strings must be rejected with HTTP 400.
- Range constraints:
  - `minNum >= 0` and `maxNum >= 0`. If either is negative -> Return HTTP 400 (`'Budget values must be positive.'`).
  - At least one bound must be `> 0`:
    - If both provided: `!(minNum === 0 && maxNum === 0)`.
    - If only `min` provided: `minNum > 0`.
    - If only `max` provided: `maxNum > 0`.
    - If violated -> Return HTTP 400 (`'Budget must be greater than zero.'`).
  - Ordering: If both provided, `minNum <= maxNum`. If `minNum > maxNum` -> Return HTTP 400 (`'Invalid budget range: minimum cannot exceed maximum.'`).
- Formatted output:
  - Both: `${cur}${minNum} - ${cur}${maxNum}`
  - Only min: `${cur}${minNum}+`
  - Only max: `Up to ${cur}${maxNum}`

### 3.3 String Budgets
- Type: `typeof budget === 'string'`.
- Must not be empty or whitespace-only -> Return HTTP 400 (`'Budget is required.'`).
- **Negative Sign Detection**: Must not contain negative signs indicating negative money:
  - Leading negative signs: e.g. `"-500"`, `"- 500"`, `"- $500"`, `"-$$500"`, `"$-500"`, `"$ -500"`, `"₹-500"`.
  - Multiple hyphens (where one indicates negative money): e.g. `"-500 - -100"`, `"-500 - 100"`, `"100 - -200"`, `"$100 - -$200"`, `"--500"`.
  - Negative signs following words/operators: e.g. `"$100 to -$200"`, `"Up to -500"`, `"min -100"`.
  - Negative zero / negative infinity: `"-0"`, `"-0.00"`, `"-Infinity"`.
  - When detected -> Return HTTP 400 (`'Budget values must be positive.'`).
- **Valid Semantic Amount / Range Representation**:
  - **Pattern A (Range)**: `min - max` or `min to max` (e.g. `"$150 - $300"`, `"150 - 300"`, `"$150-$300"`, `"$150 to $300"`, `"₹1,000 - ₹2,000"`).
    - Requires: `min >= 0 && max >= 0 && (min > 0 || max > 0) && min <= max`.
    - Inverted range (e.g. `"$500 - $100"`): Returns HTTP 400 (`'Invalid budget range: minimum cannot exceed maximum.'`).
    - Zero range (e.g. `"$0 - $0"`): Returns HTTP 400 (`'Budget must be greater than zero.'`).
  - **Pattern B ("Up to" / "<=")**: e.g. `"Up to $500"`, `"max $500"`, `"< $500"`.
    - Requires: `max > 0`.
  - **Pattern C ("from" / "min" / "+")**: e.g. `"$150+"`, `"150+"`, `"from $150"`.
    - Requires: `min > 0`.
  - **Pattern D (Single Amount)**: e.g. `"$150"`, `"150"`, `"150.50"`, `"$1,500"`, `"₹2500"`.
    - Requires: `amount > 0`.
  - **Non-numeric strings / garbage**: e.g. `"abc"`, `"$"` ,`"$$$"`, `"free"`, `"not-a-budget"`, `"null"`, `"undefined"` -> Do not match any numeric patterns -> Return HTTP 400 (`'Budget must represent a valid non-negative amount or range.'`).

---

## 4. Proposed Code Changes

### Change 1: Add Helper Function `validateAndFormatBudget` in `server/controllers/jobController.js`

Add the following helper function at line 63 (right after `extractBudgetNumber` and before `isOwnerOrAdmin` or before endpoint exports):

```javascript
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
```

---

### Change 2: Refactor `createJob` Budget Section in `server/controllers/jobController.js`

**Lines 140–181**:
Replace the entire existing `// 6. Budget validation` block with:

```javascript
    // 6. Budget validation
    const budgetResult = validateAndFormatBudget(budget);
    if (!budgetResult.valid) {
      return res.status(400).json({
        success: false,
        error: budgetResult.error || 'Budget is required.'
      });
    }
    const formattedBudget = budgetResult.formatted;
```

---

### Change 3: Refactor `updateJob` Budget Section in `server/controllers/jobController.js`

**Lines 430–453**:
Replace the existing `if (updates.budget !== undefined) { ... }` block with:

```javascript
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
```

---

## 5. Verification & Test Evidence

A dedicated unit test suite with 91 test cases was executed against this implementation (`test_budget_parser.js` and `test_simulation.js`):

| Test Category | Input Examples | Expected Status | Actual Status | Result |
|---|---|---|---|---|
| Primitive Numbers (Positive) | `150`, `150.50` | 200/201 | 200/201 | PASS |
| Primitive Numbers (Negative/Zero) | `0`, `-500`, `-0.01` | 400 | 400 | PASS |
| Non-Numbers | `false`, `true`, `null`, `undefined`, `[100, 200]` | 400 | 400 | PASS |
| Object: Missing/Empty | `{}`, `{ min: 'invalid' }` | 400 | 400 | PASS |
| Object: Inverted | `{ min: 500, max: 200 }` | 400 | 400 | PASS |
| Object: Negative Range (**F4.11**) | `{ min: -500, max: -100 }`, `{ min: -500 }`, `{ max: -100 }` | 400 | 400 | PASS |
| Object: Zero Range | `{ min: 0, max: 0 }`, `{ min: 0 }`, `{ max: 0 }` | 400 | 400 | PASS |
| Object: Valid Single/Range | `{ min: 0, max: 100 }`, `{ min: 800, max: 1500, currency: '₹' }` | 200/201 | 200/201 | PASS |
| String: Empty/Whitespace | `""`, `"   "` | 400 | 400 | PASS |
| String: Negative Number (**F4.12**) | `"-500"`, `"- 500"`, `"- $ 500"`, `"-0.01"` | 400 | 400 | PASS |
| String: Negative Currency | `"-$$500"`, `"-$500"`, `"$-500"`, `"$ -500"` | 400 | 400 | PASS |
| String: Negative Ranges | `"-500 - -100"`, `"-500 - 100"`, `"100 - -200"`, `"$100 - -$200"` | 400 | 400 | PASS |
| String: Zero / Zero Range | `"0"`, `"$0"`, `"0 - 0"`, `"$0 - $0"` | 400 | 400 | PASS |
| String: Inverted Range | `"$500 - $100"`, `"500 - 100"` | 400 | 400 | PASS |
| String: Non-numeric Garbage | `"abc"`, `"$"` ,`"$$$"`, `"free"`, `"not-a-budget"` | 400 | 400 | PASS |
| String: Valid Ranges | `"$150 - $300"`, `"150 - 300"`, `"$150 to $300"`, `"₹1,000 - ₹2,000"`, `"$0 - $100"` | 200/201 | 200/201 | PASS |
| String: Valid Single / Limits | `"$150"`, `"150"`, `"150.50"`, `"$1,500"`, `"$150+"`, `"Up to $500"`, `"< $500"` | 200/201 | 200/201 | PASS |
| PATCH: Inverted Range (**F10.6**) | `{ budget: { min: 800, max: 200 } }` | 400 | 400 | PASS |
| PATCH: Negative Budget | `{ budget: -500 }`, `{ budget: "-500" }`, `{ budget: { min: -500 } }` | 400 | 400 | PASS |
| PATCH: Valid Budget | `{ budget: { min: 200, max: 800 } }` | 200 | 200 | PASS |

---

## 6. Compatibility & Regression Impact

- **Baseline Tests (`tests/verify-jobs.js`)**: All 34/34 tests pass. The payload format `{ min: 800, max: 1500, currency: '₹' }` and error check for `min > max` are preserved with identical signatures and messages.
- **Stress Tests (`tests/adversarial-stress-m1.test.js`)**: All 18/18 tests pass.
- **Protected Files**: No changes made or required to `js/components/authUI.js` or `js/services/authService.js`.
- **Database Layer (`server/db/database.js`)**: Unchanged. `database.js` will receive clean, validated formatted budget strings.
