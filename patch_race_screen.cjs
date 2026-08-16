const fs = require('fs');
const file = 'src/screens/RaceScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

if (!src.includes('Trophy')) src = src.replace('Award,', 'Award, Trophy,');

const headerBlock = `<div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 text-xs font-bold text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Hub
        </button>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-neon-magenta">
          Auto-Drag
        </p>
        <span className="text-xs font-medium tabular-nums text-neon-magenta">{neon} NEON</span>
      </div>`;

const newHeaderBlock = headerBlock + `\n      <button
         type="button"
         onClick={() => window.dispatchEvent(new CustomEvent('openLeaderboard'))}
         className="rounded-xl border border-neon-cyan/40 bg-neon-cyan/10 p-3 flex items-center justify-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-neon-cyan hover:bg-neon-cyan/20 transition-colors"
      >
         <Trophy className="h-4 w-4" /> Racing Leaderboard
      </button>`;

src = src.replace(headerBlock, newHeaderBlock);
fs.writeFileSync(file, src);
