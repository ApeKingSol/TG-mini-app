const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /url: appUrl \/\/ The standard Telegram deep link. If the user clicks this, it opens the Mini App natively./,
  `web_app: { url: \`https://ais-pre-hab5dwyhgai6yboo6uhynr-789819255337.europe-west2.run.app\${payload ? '?tgWebAppStartParam=' + payload : ''}\` }`
);

fs.writeFileSync(file, src);
