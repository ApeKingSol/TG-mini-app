const fs = require('fs');
const file = 'netlify/functions/leaderboard.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'name: `Runner #${blob.key.slice(-4)}`,',
  `name: (data as any).telegramFirstName || (data as any).telegramUsername || \`Runner #\${blob.key.slice(-4)}\`,`
);

fs.writeFileSync(file, src);
