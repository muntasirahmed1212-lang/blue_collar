/**
 * Adversarial probe script for Milestone M2:
 * Tests auth gating, input validation logic, debounce guards,
 * and error handling in js/components/modal.js and js/components/jobModal.js
 */

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

console.log('=== RUNNING ADVERSARIAL STRESS PROBES FOR M2 ===\n');

// 1. Inspect source files directly for hardcoded or facade patterns
console.log('--- 1. Integrity Violation Checks ---');
const filesToCheck = [
  'js/services/jobService.js',
  'js/components/jobModal.js',
  'js/components/modal.js',
  'server/controllers/jobController.js',
  'server/routes/jobs.js',
  'server/middleware/authMiddleware.js'
];

for (const relPath of filesToCheck) {
  const content = fs.readFileSync(path.resolve(relPath), 'utf8');
  // Check for suspicious hardcoding of test user IDs in production logic
  assert.ok(!content.includes('cust-verified-alice-101'), `Suspicious test artifact in ${relPath}`);
  assert.ok(!content.includes('cust-verified-bob-102'), `Suspicious test artifact in ${relPath}`);
  assert.ok(!content.includes('test-mock-otp-success'), `Suspicious test artifact in ${relPath}`);
}
console.log('  ✅ No test fixtures or hardcoded IDs found in source code.');

// 2. Validate form validation logic extracted from jobModal.js
console.log('--- 2. Form Validation Logic Stress Tests ---');

// We extract and run the validation function from jobModal.js
const jobModalContent = fs.readFileSync('js/components/jobModal.js', 'utf8');
// Extract validateJobForm function body
const fnMatch = jobModalContent.match(/function validateJobForm\(form\) \{([\s\S]*?)\n\}/);
assert.ok(fnMatch, 'validateJobForm function must be found in jobModal.js');

const validateJobForm = new Function('form', fnMatch[1]);

function makeForm(overrides = {}) {
  const defaults = {
    title: { value: 'Fix kitchen sink leak' },
    category: { value: 'cat-2' },
    description: { value: 'The pipe under the kitchen sink is leaking heavily and needs replacement.' },
    location: { value: 'Seattle, WA' },
    budgetMin: { value: '100' },
    budgetMax: { value: '250' },
    urgency: { value: 'medium' },
    preferredDate: { value: '' },
    photos: { value: '' }
  };
  return { ...defaults, ...overrides };
}

// Test valid form
{
  const { isValid, errors } = validateJobForm(makeForm());
  assert.equal(isValid, true, 'Default form should be valid');
  assert.deepEqual(errors, {}, 'Should have zero errors');
  console.log('  ✅ Baseline valid form passes.');
}

// Test empty title
{
  const { isValid, errors } = validateJobForm(makeForm({ title: { value: '   ' } }));
  assert.equal(isValid, false);
  assert.equal(errors.title, 'Job title is required.');
  console.log('  ✅ Empty title rejected.');
}

// Test short title (< 5)
{
  const { isValid, errors } = validateJobForm(makeForm({ title: { value: 'Fix' } }));
  assert.equal(isValid, false);
  assert.equal(errors.title, 'Job title must be at least 5 characters long.');
  console.log('  ✅ Short title (<5 chars) rejected.');
}

// Test long title (> 100)
{
  const { isValid, errors } = validateJobForm(makeForm({ title: { value: 'A'.repeat(101) } }));
  assert.equal(isValid, false);
  assert.equal(errors.title, 'Job title cannot exceed 100 characters.');
  console.log('  ✅ Long title (>100 chars) rejected.');
}

// Test empty category
{
  const { isValid, errors } = validateJobForm(makeForm({ category: { value: '' } }));
  assert.equal(isValid, false);
  assert.equal(errors.category, 'Please select a service category.');
  console.log('  ✅ Empty category rejected.');
}

// Test empty description
{
  const { isValid, errors } = validateJobForm(makeForm({ description: { value: '   ' } }));
  assert.equal(isValid, false);
  assert.equal(errors.description, 'Job description is required.');
  console.log('  ✅ Empty description rejected.');
}

// Test short description (< 10)
{
  const { isValid, errors } = validateJobForm(makeForm({ description: { value: 'Too short' } }));
  assert.equal(isValid, false);
  assert.equal(errors.description, 'Job description must be at least 10 characters long.');
  console.log('  ✅ Short description (<10 chars) rejected.');
}

// Test long description (> 2000)
{
  const { isValid, errors } = validateJobForm(makeForm({ description: { value: 'D'.repeat(2001) } }));
  assert.equal(isValid, false);
  assert.equal(errors.description, 'Job description cannot exceed 2000 characters.');
  console.log('  ✅ Long description (>2000 chars) rejected.');
}

// Test empty location
{
  const { isValid, errors } = validateJobForm(makeForm({ location: { value: ' ' } }));
  assert.equal(isValid, false);
  assert.equal(errors.location, 'Job location is required.');
  console.log('  ✅ Empty location rejected.');
}

// Test short location (< 2)
{
  const { isValid, errors } = validateJobForm(makeForm({ location: { value: 'X' } }));
  assert.equal(isValid, false);
  assert.equal(errors.location, 'Location must be at least 2 characters.');
  console.log('  ✅ Short location (<2 chars) rejected.');
}

// Test empty budget
{
  const { isValid, errors } = validateJobForm(makeForm({ budgetMin: { value: '' }, budgetMax: { value: '' } }));
  assert.equal(isValid, false);
  assert.equal(errors.budget, 'Please enter an estimated budget (min, max, or range).');
  console.log('  ✅ Missing budget rejected.');
}

// Test min budget > max budget
{
  const { isValid, errors } = validateJobForm(makeForm({ budgetMin: { value: '500' }, budgetMax: { value: '200' } }));
  assert.equal(isValid, false);
  assert.equal(errors.budget, 'Minimum budget cannot exceed maximum budget.');
  console.log('  ✅ Inverted budget range (min > max) rejected.');
}

// Test negative budget
{
  const { isValid, errors } = validateJobForm(makeForm({ budgetMin: { value: '-10' }, budgetMax: { value: '100' } }));
  assert.equal(isValid, false);
  assert.equal(errors.budget, 'Minimum budget must be a positive number.');
  console.log('  ✅ Negative min budget rejected.');
}

// Test both budget zero
{
  const { isValid, errors } = validateJobForm(makeForm({ budgetMin: { value: '0' }, budgetMax: { value: '0' } }));
  assert.equal(isValid, false);
  assert.equal(errors.budget, 'Budget must be greater than zero.');
  console.log('  ✅ Zero budget rejected.');
}

// Test single max budget (min empty) -> valid
{
  const { isValid, errors } = validateJobForm(makeForm({ budgetMin: { value: '' }, budgetMax: { value: '300' } }));
  assert.equal(isValid, true);
  console.log('  ✅ Single max budget allowed.');
}

// Test single min budget (max empty) -> valid
{
  const { isValid, errors } = validateJobForm(makeForm({ budgetMin: { value: '150' }, budgetMax: { value: '' } }));
  assert.equal(isValid, true);
  console.log('  ✅ Single min budget allowed.');
}

// Test invalid urgency
{
  const { isValid, errors } = validateJobForm(makeForm({ urgency: { value: 'super-fast' } }));
  assert.equal(isValid, false);
  assert.equal(errors.urgency, 'Please select a valid urgency level.');
  console.log('  ✅ Invalid urgency value rejected.');
}

// Test past date
{
  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const { isValid, errors } = validateJobForm(makeForm({ preferredDate: { value: pastDate } }));
  assert.equal(isValid, false);
  assert.equal(errors.preferredDate, 'Preferred date and time cannot be in the past.');
  console.log('  ✅ Past preferred date rejected.');
}

// Test future date -> valid
{
  const futureDate = new Date(Date.now() + 86400000).toISOString();
  const { isValid, errors } = validateJobForm(makeForm({ preferredDate: { value: futureDate } }));
  assert.equal(isValid, true);
  console.log('  ✅ Future preferred date accepted.');
}

// Test invalid photo URL
{
  const { isValid, errors } = validateJobForm(makeForm({ photos: { value: 'ftp://not-allowed.com/img.jpg' } }));
  assert.equal(isValid, false);
  assert.ok(errors.photos.includes('Invalid photo URL format'));
  console.log('  ✅ Malformed photo URL protocol rejected.');
}

// Test valid comma-separated photo URLs
{
  const { isValid, errors } = validateJobForm(makeForm({ photos: { value: 'https://example.com/a.jpg, https://example.com/b.png' } }));
  assert.equal(isValid, true);
  console.log('  ✅ Valid comma-separated photo URLs accepted.');
}

// 3. Test handlePostJobClick Auth Gating
console.log('\n--- 3. Auth Gating & Dispatch Tests ---');

const modalContent = fs.readFileSync('js/components/modal.js', 'utf8');
assert.ok(modalContent.includes("showToast(\"Please log in to post a job.\", \"info\");"), 'Must display info toast on unauthenticated');
assert.ok(modalContent.includes("window.authUI.openModal('login-modal')"), 'Must open login-modal on unauthenticated');
assert.ok(modalContent.includes("showToast(\"Only customers can post jobs.\", \"error\");"), 'Must display error toast on non-customer');
assert.ok(modalContent.includes("openJobModal();"), 'Must invoke openJobModal on customer');
assert.ok(modalContent.includes("isCheckingAuth"), 'Must have concurrency debounce guard');

console.log('  ✅ All auth gating criteria and edge cases verified successfully.');
console.log('\n=== ALL ADVERSARIAL STRESS PROBES PASSED ===');
