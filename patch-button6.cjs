const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /const BOT_USERNAME = 'garage_mechanic_bot';\n\s+let appUrl = \`https:\/\/t\.me\/\$\{BOT_USERNAME\}\/app\`;\n\s+if \(payload\) \{\n\s+appUrl \+= \`\?startapp=\$\{payload\}\`;\n\s+\}/,
  `const BOT_USERNAME = 'garage_mechanic_bot';
    // The link that the button should open must be the short link that opens the Mini App
    let appUrl = \`https://t.me/\${BOT_USERNAME}/app\`;
    if (payload) {
      appUrl += \`?startapp=\${payload}\`;
    }`
);

fs.writeFileSync(file, src);
