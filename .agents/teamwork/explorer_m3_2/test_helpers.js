const assert = require('node:assert/strict');

function formatRelativeTime(dateInput) {
  if (!dateInput) return 'Recently';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return 'Recently';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 45) {
    return 'Just now';
  }
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return diffInMinutes === 1 ? '1 minute ago' : `${diffInMinutes} minutes ago`;
  }
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return diffInHours === 1 ? '1 hour ago' : `${diffInHours} hours ago`;
  }
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return diffInDays === 1 ? '1 day ago' : `${diffInDays} days ago`;
  }
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return diffInMonths === 1 ? '1 month ago' : `${diffInMonths} months ago`;
  }
  const diffInYears = Math.floor(diffInDays / 365);
  return diffInYears === 1 ? '1 year ago' : `${diffInYears} years ago`;
}

function extractBudgetNumber(budget) {
  if (typeof budget === 'number') return isNaN(budget) ? 0 : budget;
  if (!budget) return 0;
  if (typeof budget === 'object') {
    return Number(budget.max || budget.min || 0);
  }
  const clean = String(budget).replace(/,/g, '');
  const matches = clean.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;
  return Number(matches[matches.length - 1]);
}

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Tests
assert.equal(formatRelativeTime(new Date()), 'Just now');
assert.equal(formatRelativeTime(new Date(Date.now() - 10 * 1000)), 'Just now');
assert.equal(formatRelativeTime(new Date(Date.now() - 65 * 1000)), '1 minute ago');
assert.equal(formatRelativeTime(new Date(Date.now() - 15 * 60 * 1000)), '15 minutes ago');
assert.equal(formatRelativeTime(new Date(Date.now() - 65 * 60 * 1000)), '1 hour ago');
assert.equal(formatRelativeTime(new Date(Date.now() - 5 * 3600 * 1000)), '5 hours ago');
assert.equal(formatRelativeTime(new Date(Date.now() - 25 * 3600 * 1000)), '1 day ago');
assert.equal(formatRelativeTime(new Date(Date.now() - 4 * 86400 * 1000)), '4 days ago');
assert.equal(formatRelativeTime(new Date(Date.now() - 35 * 86400 * 1000)), '1 month ago');
assert.equal(formatRelativeTime(new Date(Date.now() - 400 * 86400 * 1000)), '1 year ago');
assert.equal(formatRelativeTime(null), 'Recently');
assert.equal(formatRelativeTime('invalid-date'), 'Recently');

assert.equal(extractBudgetNumber(150), 150);
assert.equal(extractBudgetNumber('$150'), 150);
assert.equal(extractBudgetNumber('$100 - $300'), 300);
assert.equal(extractBudgetNumber('₹1,500'), 1500);
assert.equal(extractBudgetNumber({ min: 100, max: 250 }), 250);
assert.equal(extractBudgetNumber(null), 0);

assert.equal(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');

console.log('All helper unit tests passed successfully!');
