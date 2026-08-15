const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /url: appUrl/,
  `url: appUrl` // The t.me/bot/app?startapp= URL format *is* the official way to open a Mini App from an inline keyboard.
);
fs.writeFileSync(file, src);
