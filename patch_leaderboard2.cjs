const fs = require('fs');
const file = 'src/screens/LeaderboardScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  '<div className="rounded-2xl border border-neon-cyan/30 bg-neon-cyan/5 p-4 text-center backdrop-blur-sm">',
  '<div className="relative rounded-2xl border border-neon-cyan/30 bg-neon-cyan/5 p-4 text-center backdrop-blur-sm">\n        <div className="absolute -top-2 -right-2 rotate-6 rounded bg-amber px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-widest text-black shadow-lg">\n          Snapshot: Sept 25\n        </div>'
);

src = src.replace('🔥 TOP 10 PLAYERS WIN EXCLUSIVE TON DROPS! (SNAPSHOT: SEPT 25)', '🔥 TOP 10 PLAYERS WIN EXCLUSIVE TON DROPS!');

fs.writeFileSync(file, src);
