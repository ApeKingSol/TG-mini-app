const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /let appUrl = \`https:\/\/t.me\/\$\{BOT_USERNAME\}\/app\`;\n\s+if \(payload\) \{\n\s+appUrl \+= \`\?startapp=\$\{payload\}\`;\n\s+\}/,
  `let appUrl = \`https://t.me/\${BOT_USERNAME}/app\`;
    if (payload) {
      // The button URL needs to use the startapp parameter.
      appUrl += \`?startapp=\${payload}\`;
    }`
);

// We need to change the button type. An inline keyboard with a url opens a web page.
// To open a Mini App, we should use a web_app button or just use the direct short link.
// Actually, t.me/bot/app?startapp=X *is* a valid direct link that opens the Mini App.
