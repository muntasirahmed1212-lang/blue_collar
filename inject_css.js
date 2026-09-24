const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
files.forEach(file => {
  const filePath = path.join(__dirname, file);
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('auth.css')) {
    html = html.replace('<link rel="stylesheet" href="./css/components.css">', '<link rel="stylesheet" href="./css/components.css">\n  <link rel="stylesheet" href="./css/auth.css">');
    // For about/services etc that might use different paths
    html = html.replace('<link rel="stylesheet" href="css/components.css">', '<link rel="stylesheet" href="css/components.css">\n  <link rel="stylesheet" href="css/auth.css">');
    fs.writeFileSync(filePath, html);
    console.log('Updated ' + file);
  }
});
