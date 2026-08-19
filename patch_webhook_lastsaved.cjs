const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'lastSaved: now,',
  'lastSaved: now + 10000, // 10 seconds in the future to guarantee client gets a 409 and adopts the purchase'
);

fs.writeFileSync(file, src);
