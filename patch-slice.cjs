const fs = require('fs');
const file = 'netlify/functions/syndicates.mts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'name: memberNames[id] ?? `Runner #${id.slice(-4)}`,',
  'name: memberNames[id] ?? `Runner #${String(id).slice(-4)}`,'
);

fs.writeFileSync(file, content);
