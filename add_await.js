const fs = require('fs');

function makeAwaited(filePath) {
  let c = fs.readFileSync(filePath, 'utf8');
  
  if (filePath.includes('authController')) {
    c = c.replace(/exports\.getMe = \(req, res\) => {/, 'exports.getMe = async (req, res) => {');
    c = c.replace(/exports\.listUsers = \(req, res\) => {/, 'exports.listUsers = async (req, res) => {');
  }

  // Manually replace each to be safe
  const methods = [
    'findUserByEmail', 'deleteUser', 'createUser', 'updateUser', 'readUsers', 
    'findUserById', 'readJobs', 'findJobById', 'createJob', 'updateJob', 'deleteJob'
  ];

  methods.forEach(method => {
    const regex = new RegExp(`(?<!await\\s)db\\.${method}\\(`, 'g');
    c = c.replace(regex, `await db.${method}(`);
  });

  fs.writeFileSync(filePath, c);
}

makeAwaited('server/controllers/authController.js');
makeAwaited('server/middleware/authMiddleware.js');
console.log('Update complete.');
