// Simple JSON-file-based database utility
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'users.json');

// Ensure file exists
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, '[]', 'utf8');
}

function readUsers() {
  const data = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(data);
}

function writeUsers(users) {
  fs.writeFileSync(DB_PATH, JSON.stringify(users, null, 2), 'utf8');
}

function findUserByEmail(email) {
  if (!email || typeof email !== 'string' || !email.trim()) return undefined;
  const users = readUsers();
  const target = email.trim().toLowerCase();
  return users.find(u => u.email && typeof u.email === 'string' && u.email.trim().toLowerCase() === target);
}

function createUser(userData) {
  const users = readUsers();
  if (userData && userData.email && typeof userData.email === 'string') {
    const targetEmail = userData.email.trim().toLowerCase();
    const verifiedUser = users.find(u => u.email && typeof u.email === 'string' && u.email.trim().toLowerCase() === targetEmail && u.isVerified);
    if (verifiedUser) {
      return verifiedUser; // Do not overwrite verified user
    }
    // Prune any unverified duplicate records with the same email
    const filtered = users.filter(u => !u.email || typeof u.email !== 'string' || u.email.trim().toLowerCase() !== targetEmail);
    filtered.push(userData);
    writeUsers(filtered);
    return userData;
  }
  users.push(userData);
  writeUsers(users);
  return userData;
}

function updateUser(email, updates) {
  if (!email || typeof email !== 'string' || !email.trim()) return null;
  const users = readUsers();
  const target = email.trim().toLowerCase();
  const index = users.findIndex(u => u.email && typeof u.email === 'string' && u.email.trim().toLowerCase() === target);
  if (index === -1) return null;
  users[index] = { ...users[index], ...updates };
  writeUsers(users);
  return users[index];
}

function deleteUser(email) {
  if (!email || typeof email !== 'string' || !email.trim()) return false;
  const users = readUsers();
  const initialLength = users.length;
  const target = email.trim().toLowerCase();
  const filtered = users.filter(u => !u.email || typeof u.email !== 'string' || u.email.trim().toLowerCase() !== target);
  if (filtered.length !== initialLength) {
    writeUsers(filtered);
    return true;
  }
  return false;
}

module.exports = { findUserByEmail, createUser, updateUser, deleteUser, readUsers };
