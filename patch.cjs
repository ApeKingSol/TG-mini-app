const fs = require('fs');

const file = 'netlify/functions/syndicates.mts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  "export default async (req: Request) => {",
  "export default async (req: Request) => {\n  try {"
);

content = content.replace(
  "return new Response('Method Not Allowed', { status: 405 });\n};",
  "return new Response('Method Not Allowed', { status: 405 });\n  } catch (e: any) {\n    return new Response(JSON.stringify({ error: e.message || String(e), stack: e.stack }), { status: 500 });\n  }\n};"
);

fs.writeFileSync(file, content);
