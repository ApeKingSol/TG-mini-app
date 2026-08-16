const fs = require('fs');
const file = 'src/screens/LeaderboardScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace("import { getTelegramUserId } from '../game/store/GameStore';", "import { getTelegramUserId, useGameStore } from '../game/store/GameStore';");

src = src.replace(
  "const myId = getTelegramUserId();",
  "const myId = getTelegramUserId();\n  const myRacesWon = useGameStore(state => state.racesWon);"
);

src = src.replace(
  '<div className="w-16" />',
  `<div className="w-16 flex justify-end">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">Your Wins</span>
            <span className="font-mono text-xs font-bold text-neon-cyan">{myRacesWon}</span>
          </div>
        </div>`
);

fs.writeFileSync(file, src);
