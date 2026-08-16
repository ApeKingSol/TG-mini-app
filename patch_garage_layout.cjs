const fs = require('fs');
const file = 'src/screens/GarageScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

const target = `<div className="flex w-full items-center justify-end">
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('openLeaderboard'))}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="panel-cut-sm flex items-center gap-1 border border-neon-pink/50 bg-neon-pink/10 px-3 py-1.5 font-mono text-xs font-semibold text-neon-pink"
          >
            <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
            EARN
          </motion.button>`;

const replacement = `<div className="flex w-full items-center justify-between mb-2">
        <motion.button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('openLeaderboard'))}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="panel-cut-sm flex items-center gap-1 border border-neon-pink/50 bg-neon-pink/10 px-3 py-1.5 font-mono text-xs font-semibold text-neon-pink"
        >
          <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
          EARN
        </motion.button>
        <div className="flex items-center gap-2">`;

src = src.replace(target, replacement);
fs.writeFileSync(file, src);
