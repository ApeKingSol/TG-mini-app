const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /web_app: \{ url: \`https:\/\/ais-pre-hab5dwyhgai6yboo6uhynr-789819255337\.europe-west2\.run\.app\$\{payload \? '\?tgWebAppStartParam=' \+ payload : ''\}\` \}/,
  `url: appUrl`
);

fs.writeFileSync(file, src);
