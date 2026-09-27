// test_simulation.js
// Verify how the proposed controller changes behave with mock req/res

const { validateAndFormatBudget } = require('./test_budget_parser');

function mockCreateJob(body) {
  let statusCode = 200;
  let jsonResponse = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    }
  };

  const budget = body.budget;
  const budgetResult = validateAndFormatBudget(budget);
  if (!budgetResult.valid) {
    res.status(400).json({
      success: false,
      error: budgetResult.error || 'Budget is required.'
    });
    return { status: statusCode, body: jsonResponse };
  }
  const formattedBudget = budgetResult.formatted;
  res.status(201).json({
    success: true,
    job: { budget: formattedBudget }
  });
  return { status: statusCode, body: jsonResponse };
}

function mockUpdateJob(body) {
  let statusCode = 200;
  let jsonResponse = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    }
  };

  const updates = body || {};
  const sanitizedUpdates = {};

  if (updates.budget !== undefined) {
    const budgetResult = validateAndFormatBudget(updates.budget);
    if (!budgetResult.valid) {
      res.status(400).json({
        success: false,
        error: budgetResult.error || 'Budget is required.'
      });
      return { status: statusCode, body: jsonResponse };
    }
    sanitizedUpdates.budget = budgetResult.formatted;
  }

  res.status(200).json({
    success: true,
    job: sanitizedUpdates
  });
  return { status: statusCode, body: jsonResponse };
}

// Check F4.11: Object budget with negative range { min: -500, max: -100 }
console.log('--- Testing F4.11 ---');
let r = mockCreateJob({ budget: { min: -500, max: -100 } });
console.log('F4.11:', r);

// Check F4.12: Negative budget string "-500"
console.log('--- Testing F4.12 ---');
r = mockCreateJob({ budget: '-500' });
console.log('F4.12:', r);

// Check F10.6: PATCH budget with min > max
console.log('--- Testing F10.6 ---');
r = mockUpdateJob({ budget: { min: 800, max: 200 } });
console.log('F10.6:', r);

// Check PATCH with negative number
console.log('--- Testing PATCH with negative number ---');
r = mockUpdateJob({ budget: -500 });
console.log('PATCH negative number:', r);

// Check PATCH with negative object
console.log('--- Testing PATCH with negative object ---');
r = mockUpdateJob({ budget: { min: -500, max: -100 } });
console.log('PATCH negative object:', r);

// Check PATCH with negative string
console.log('--- Testing PATCH with negative string ---');
r = mockUpdateJob({ budget: '-500' });
console.log('PATCH negative string:', r);

// Check valid patch
console.log('--- Testing valid PATCH ---');
r = mockUpdateJob({ budget: { min: 200, max: 800 } });
console.log('Valid PATCH:', r);
