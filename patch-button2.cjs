const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /url: appUrl/,
  `web_app: { url: "https://ais-dev-hab5dwyhgai6yboo6uhynr-789819255337.europe-west2.run.app" } // Fallback if url doesn't work directly, but Telegram supports web_app buttons. Actually wait, startapp params don't work with web_app buttons easily without passing through init data.`
);
