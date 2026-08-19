const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'lastSaved: Date.now()',
  'lastSaved: Date.now() + 10000'
);

fs.writeFileSync(file, src);
