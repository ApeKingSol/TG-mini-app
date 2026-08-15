const fs = require('fs');
const file = 'netlify/functions/referrals.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /const startParam = new URLSearchParams\(rawInitData\)\.get\('start_param'\) \?\? '';/,
  `// Telegram passes startapp param exactly as it is, BUT if the link used was ?start=... 
  // (which is the standard way a bot starts, and how we generated our link to launch the bot), 
  // Telegram injects it into initData as start_param.
  const startParam = new URLSearchParams(rawInitData).get('start_param') ?? '';`
);

fs.writeFileSync(file, src);
