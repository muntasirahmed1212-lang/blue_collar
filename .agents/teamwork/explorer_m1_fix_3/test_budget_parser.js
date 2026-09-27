// test_budget_parser.js
// Exploration script for testing budget validation logic

function validateAndFormatBudget(budget) {
  // 1. Primitive numbers: must be > 0 and finite
  if (typeof budget === 'number') {
    if (isNaN(budget) || !Number.isFinite(budget) || budget <= 0) {
      return { valid: false, error: 'Budget must be greater than zero.' };
    }
    return { valid: true, formatted: `$${budget}` };
  }

  // 2. Reject non-object / non-string / boolean / null / arrays
  if (budget === null || budget === undefined || typeof budget === 'boolean' || Array.isArray(budget)) {
    return { valid: false, error: 'Budget is required.' };
  }

  // Helper to parse numbers from strings or numbers
  function parseVal(v) {
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

  // 3. Object ranges
  if (typeof budget === 'object') {
    const hasMin = budget.min !== undefined && budget.min !== null;
    const hasMax = budget.max !== undefined && budget.max !== null;

    if (!hasMin && !hasMax) {
      return { valid: false, error: 'Budget is required.' };
    }

    let minNum, maxNum;
    if (hasMin) {
      minNum = parseVal(budget.min);
      if (minNum === null) {
        return { valid: false, error: 'Budget is required.' };
      }
    }
    if (hasMax) {
      maxNum = parseVal(budget.max);
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

    // Check for negative signs
    // Examples of negative signs:
    // - "-500", "-$500", "$-500", "- 500", "- $ 500", "$ - 500"
    // - "$100 - -500", "$100 - -$500", "$100 - $-500", "$100 to -$200"
    // - "--500", "-0"
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

    // Now parse amounts from string
    // Supported string forms:
    // 1. Range: "$100 - $200", "100 - 200", "$100-$200", "$100 to $200"
    // 2. Plus: "$100+", "100+"
    // 3. Up to: "Up to $100", "max $100"
    // 4. Single amount: "$100", "100", "₹1,500"

    // Normalize commas in numbers (e.g. 1,000 -> 1000)
    const normalized = raw.replace(/(\d),(\d)/g, '$1$2');

    // Check for range: num1 - num2 or num1 to num2
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

    // Check for "Up to" / "<=" / "<"
    const upToMatch = normalized.match(/^(?:up\s+to|max|under|<|<=)\s*([^\d]*)\s*(\d+(?:\.\d+)?)\s*$/i);
    if (upToMatch) {
      const max = Number(upToMatch[2]);
      if (isNaN(max) || max <= 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
      return { valid: true, formatted: raw };
    }

    // Check for "min" / "from" / "+"
    const minMatch = normalized.match(/^(?:from|min|above|>|>=)\s*([^\d]*)\s*(\d+(?:\.\d+)?)\s*$/i) ||
                     normalized.match(/^([^\d]*)\s*(\d+(?:\.\d+)?)\s*\+\s*$/i);
    if (minMatch) {
      const min = Number(minMatch[2]);
      if (isNaN(min) || min <= 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
      return { valid: true, formatted: raw };
    }

    // Check for single amount: "$150", "150", "₹500", "150.50"
    const singleMatch = normalized.match(/^([^\d]*)\s*(\d+(?:\.\d+)?)\s*$/);
    if (singleMatch) {
      const val = Number(singleMatch[2]);
      if (isNaN(val) || val <= 0) {
        return { valid: false, error: 'Budget must be greater than zero.' };
      }
      return { valid: true, formatted: raw };
    }

    // If none of the valid patterns matched (e.g. "abc", "free", "$#@!")
    return { valid: false, error: 'Budget must represent a valid non-negative amount or range.' };
  }

  return { valid: false, error: 'Budget is required.' };
}

// TEST CASES
const testCases = [
  // Numbers
  { input: 150, expectedValid: true },
  { input: 0, expectedValid: false },
  { input: -500, expectedValid: false },
  { input: -0.01, expectedValid: false },
  { input: NaN, expectedValid: false },
  { input: Infinity, expectedValid: false },

  // Non-numbers / types
  { input: false, expectedValid: false },
  { input: true, expectedValid: false },
  { input: null, expectedValid: false },
  { input: undefined, expectedValid: false },
  { input: [100, 200], expectedValid: false },

  // Objects
  { input: {}, expectedValid: false },
  { input: { min: 'invalid' }, expectedValid: false },
  { input: { min: 500, max: 200 }, expectedValid: false },
  { input: { min: -500, max: -100 }, expectedValid: false },
  { input: { min: -500 }, expectedValid: false },
  { input: { max: -100 }, expectedValid: false },
  { input: { min: 0, max: 0 }, expectedValid: false },
  { input: { min: 0 }, expectedValid: false },
  { input: { max: 0 }, expectedValid: false },
  { input: { min: 0, max: 100 }, expectedValid: true, expectedFormat: '$0 - $100' },
  { input: { min: 800, max: 1500, currency: '₹' }, expectedValid: true, expectedFormat: '₹800 - ₹1500' },
  { input: { min: 100 }, expectedValid: true, expectedFormat: '$100+' },
  { input: { max: 500 }, expectedValid: true, expectedFormat: 'Up to $500' },
  { input: { min: '100', max: '200' }, expectedValid: true, expectedFormat: '$100 - $200' },

  // Strings - Invalid (Negative money)
  { input: '', expectedValid: false },
  { input: '   ', expectedValid: false },
  { input: '-500', expectedValid: false },
  { input: '- 500', expectedValid: false },
  { input: '-$500', expectedValid: false },
  { input: '- $500', expectedValid: false },
  { input: '- $ 500', expectedValid: false },
  { input: '$-500', expectedValid: false },
  { input: '$ -500', expectedValid: false },
  { input: '$ - 500', expectedValid: false },
  { input: '$100 to -200', expectedValid: false },
  { input: '$100 to -$200', expectedValid: false },
  { input: '$100 to - $ 200', expectedValid: false },
  { input: '-0.01', expectedValid: false },
  { input: '-$0.01', expectedValid: false },
  { input: '-500 - -100', expectedValid: false },
  { input: '-500 - 100', expectedValid: false },
  { input: '100 - -200', expectedValid: false },
  { input: '$100 - -$200', expectedValid: false },
  { input: '$100 - $-200', expectedValid: false },
  { input: '--500', expectedValid: false },
  { input: '-0', expectedValid: false },
  { input: '- $0', expectedValid: false },
  { input: '$ -0', expectedValid: false },
  { input: '-Infinity', expectedValid: false },

  // Strings - Invalid (Zero or non-positive / inverted)
  { input: '0', expectedValid: false },
  { input: '$0', expectedValid: false },
  { input: '0.00', expectedValid: false },
  { input: '$0.00', expectedValid: false },
  { input: '0 - 0', expectedValid: false },
  { input: '$0 - $0', expectedValid: false },
  { input: '$0 - 0', expectedValid: false },
  { input: '0.00 - 0.00', expectedValid: false },
  { input: '$500 - $100', expectedValid: false },
  { input: '500 - 100', expectedValid: false },
  { input: '$1000 - $500', expectedValid: false },
  { input: '200 to 100', expectedValid: false },

  // Strings - Invalid (Non-numeric / garbage)
  { input: 'abc', expectedValid: false },
  { input: '$', expectedValid: false },
  { input: '$$$', expectedValid: false },
  { input: 'free', expectedValid: false },
  { input: 'not-a-budget', expectedValid: false },
  { input: 'null', expectedValid: false },
  { input: 'undefined', expectedValid: false },
  { input: 'NaN', expectedValid: false },
  { input: 'Infinity', expectedValid: false },
  { input: '[100, 200]', expectedValid: false },

  // Strings - Valid
  { input: '$150 - $300', expectedValid: true },
  { input: '150 - 300', expectedValid: true },
  { input: '$150-$300', expectedValid: true },
  { input: '$150 to $300', expectedValid: true },
  { input: '₹1,000 - ₹2,000', expectedValid: true },
  { input: '$150', expectedValid: true },
  { input: '150', expectedValid: true },
  { input: '150.50', expectedValid: true },
  { input: '$1,500', expectedValid: true },
  { input: '₹2500', expectedValid: true },
  { input: '$150+', expectedValid: true },
  { input: '150+', expectedValid: true },
  { input: 'Up to $500', expectedValid: true },
  { input: 'up to 500', expectedValid: true },
  { input: '< $500', expectedValid: true },
  { input: 'max $500', expectedValid: true },
  { input: '$0 - $100', expectedValid: true },
  { input: '0 - 100', expectedValid: true },
  { input: '$50.50 - $100.75', expectedValid: true }
];

let failed = 0;
for (const tc of testCases) {
  const res = validateAndFormatBudget(tc.input);
  const ok = res.valid === tc.expectedValid;
  if (!ok) {
    console.log(`FAIL for ${JSON.stringify(tc.input)}: expected valid=${tc.expectedValid}, got valid=${res.valid}, error=${res.error}`);
    failed++;
  } else if (tc.expectedFormat && res.formatted !== tc.expectedFormat) {
    console.log(`FAIL format for ${JSON.stringify(tc.input)}: expected format=${tc.expectedFormat}, got format=${res.formatted}`);
    failed++;
  } else {
    // console.log(`PASS for ${JSON.stringify(tc.input)} -> ${res.formatted || res.error}`);
  }
}

module.exports = { validateAndFormatBudget };
