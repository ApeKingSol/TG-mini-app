const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /let appUrl = \`https:\/\/t.me\/\$\{BOT_USERNAME\}\/app\`;\n\s+if \(payload\) \{\n\s+appUrl \+= \`\?startapp=\$\{payload\}\`;\n\s+\}/,
  `let appUrl = \`https://t.me/\${BOT_USERNAME}/app\`;
    if (payload) {
      appUrl += \`?startapp=\${payload}\`;
    }`
);

src = src.replace(
  /url: appUrl/,
  `url: appUrl // The standard Telegram deep link. If the user clicks this, it opens the Mini App natively.`
);
fs.writeFileSync(file, src);
