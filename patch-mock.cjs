const fs = require('fs');
const file = 'server/mock-blobs.ts';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "const realStore = getNetlifyStore(nameOrOptions);",
  "const realStore = getNetlifyStore(nameOrOptions as any);"
);
fs.writeFileSync(file, content);
