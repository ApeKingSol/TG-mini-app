const fs = require('fs');
const file = 'src/screens/GarageScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

// Ensure Trophy is imported
if (!src.includes('Trophy')) {
  src = src.replace('Gift,', 'Gift, Trophy,');
}

const buttonsHtml = `<motion.button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('openLeaderboard'))}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="panel-cut-sm flex items-center gap-1 border border-neon-pink/50 bg-neon-pink/10 px-3 py-1.5 font-mono text-xs font-semibold text-neon-pink"
          >
            <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
            EARN
          </motion.button>
          <motion.button`;

src = src.replace('<motion.button', buttonsHtml);

fs.writeFileSync(file, src);
