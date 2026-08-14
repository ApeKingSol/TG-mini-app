const fs = require('fs');
const file = 'netlify/functions/syndicates.mts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'id: crypto.randomUUID(),',
  'id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),'
);

fs.writeFileSync(file, content);
