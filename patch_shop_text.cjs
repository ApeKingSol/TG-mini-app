const fs = require('fs');
const file = 'src/screens/ShopScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  '3x speed (income & collection), unlimited energy, higher chance for critical part upgrades for 1 day.',
  'Supercharge your garage! Get 3X Scrap production, infinite Energy, and a massive boost to critical merge chances for a full 24 hours.'
);

src = src.replace(
  '3x speed, unlimited energy, higher chance for critical part upgrades for 3 days AND raises AFK cap to 72 hours.',
  'The ultimate progression hack! Enjoy 72 hours of 3X Scrap production, infinite Energy, increased critical merge chances, AND a massive 72-hour AFK cap!'
);

fs.writeFileSync(file, src);
