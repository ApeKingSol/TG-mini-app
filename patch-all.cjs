const fs = require('fs');

const files = fs.readdirSync('netlify/functions').filter(f => f.endsWith('.mts') && !f.startsWith('_'));

for (const file of files) {
  const path = 'netlify/functions/' + file;
  let content = fs.readFileSync(path, 'utf8');
  
  if (!content.includes('catch (e: any) {') && content.includes('export default async (req: Request) => {')) {
    content = content.replace(
      "export default async (req: Request) => {",
      "export default async (req: Request) => {\n  try {"
    );

    if (content.includes("return new Response('Method Not Allowed', { status: 405 });\n};")) {
      content = content.replace(
        "return new Response('Method Not Allowed', { status: 405 });\n};",
        "return new Response('Method Not Allowed', { status: 405 });\n  } catch (e: any) {\n    return new Response(JSON.stringify({ error: e.message || String(e), stack: e.stack }), { status: 500 });\n  }\n};"
      );
      fs.writeFileSync(path, content);
      console.log('Patched', path);
    }
  }
}
