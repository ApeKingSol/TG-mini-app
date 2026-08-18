const fs = require('fs');
const file = 'src/screens/LeaderboardScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('🔥 TOP 10 PLAYERS WIN EXCLUSIVE TON DROPS!', '🔥 TOP 10 PLAYERS WIN EXCLUSIVE TON DROPS! (SNAPSHOT: SEPT 25)');
src = src.replace('Win PvP races in Auto-Drag to climb the ranks!', 'Rewards will be sent to your connected wallets.');

fs.writeFileSync(file, src);
