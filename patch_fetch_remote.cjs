const fs = require('fs');
const file = 'src/hooks/useCloudSync.ts';
let src = fs.readFileSync(file, 'utf8');

const target = `async function fetchRemoteState(initData: string): Promise<PlayerState | null> {
  const res = await fetch(SYNC_ENDPOINT, { headers: { 'x-telegram-init-data': initData } });
  if (!res.ok) return null;
  const body = await res.json();
  return body.state || null;
}`;

// Note: it might have a try-catch block inside, let's regex it
const regex = /async function fetchRemoteState.*?return body\.state \|\| null;\n.*?\}/s;

src = src.replace(regex, `async function fetchRemoteState(initData: string): Promise<PlayerState | null> {
  const res = await fetch(SYNC_ENDPOINT, { headers: { 'x-telegram-init-data': initData } });
  if (!res.ok) throw new Error(\`Sync failed with status: \${res.status}\`);
  const body = await res.json();
  return body.state || null;
}`);

fs.writeFileSync(file, src);
