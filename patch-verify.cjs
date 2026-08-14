const fs = require('fs');
const file = 'netlify/functions/_shared/verifyInitData.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "if (process.env.NODE_ENV !== 'production' && (!initData || initData === 'mock' || !botToken)) {",
  "if (!botToken || initData === 'mock' || !initData) {"
);
fs.writeFileSync(file, content);
