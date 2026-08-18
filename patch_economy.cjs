const fs = require('fs');
const file = 'src/game/config/economy.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'export const NEON_TO_SCRAP_RATE = 10_000;',
  'export const NEON_TO_SCRAP_RATE = 1000;'
);

fs.writeFileSync(file, src);
