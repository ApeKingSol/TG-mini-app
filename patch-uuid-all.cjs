const fs = require('fs');
const files = fs.readdirSync('netlify/functions').filter(f => f.endsWith('.mts') && !f.startsWith('_'));

for (const file of files) {
  const path = 'netlify/functions/' + file;
  let content = fs.readFileSync(path, 'utf8');
  if (content.includes('crypto.randomUUID()')) {
    content = content.replaceAll(
      'crypto.randomUUID()',
      '(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15))'
    );
    fs.writeFileSync(path, content);
    console.log('Patched UUID', path);
  }
}
