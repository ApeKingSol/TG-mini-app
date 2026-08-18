const fs = require('fs');
const file = 'src/screens/SyndicateHub.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'Earnings Split',
  'Night Siege Rewards'
);

src = src.replace(
  'When a Syndicate member wins a race, a percentage of the payout is distributed among the Syndicate:',
  'When a Syndicate defeats the Night Siege Boss, members receive a $NEON bounty based on their role:'
);

src = src.replace(
  '<span className="font-mono text-amber">Gets highest %</span>',
  '<span className="font-mono text-amber">250 NEON</span>'
);

src = src.replace(
  '<span className="font-mono text-neon-cyan">Get medium %</span>',
  '<span className="font-mono text-neon-cyan">150 NEON</span>'
);

src = src.replace(
  '<span className="font-mono text-neutral-400">Share remaining %</span>',
  '<span className="font-mono text-neutral-400">75 NEON</span>'
);

fs.writeFileSync(file, src);
