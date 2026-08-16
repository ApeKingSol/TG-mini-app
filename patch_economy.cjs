const fs = require('fs');
const file = 'src/game/config/economy.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace("description: 'Win 10 races in Auto-Drag (Race vs Player or Syndicate Bot).',", "description: 'Win 10 races in Auto-Drag (Race vs Player only).',");

fs.writeFileSync(file, src);
