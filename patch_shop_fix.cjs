const fs = require('fs');
const file = 'src/screens/ShopScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('Auto-collects Scrap and triples your passive income for 24 hours — the fastest way to            your next trade-in.', '3x speed (income & collection), unlimited energy, higher chance for critical part upgrades for 1 day.');
src = src.replace('Triples your passive Scrap income for a full 3 days AND raises your AFK offline cap to            72 hours while active — go dark for the whole weekend and come back to a full tank.', '3x speed, unlimited energy, higher chance for critical part upgrades for 3 days AND raises AFK cap to 72 hours.');

// The string might have newlines. Let's use a regex to match it more safely.
src = src.replace(/Auto-collects Scrap and triples your passive income for 24 hours — the fastest way to\s*your next trade-in\./g, '3x speed (income & collection), unlimited energy, higher chance for critical part upgrades for 1 day.');
src = src.replace(/Triples your passive Scrap income for a full 3 days AND raises your AFK offline cap to\s*72 hours while active — go dark for the whole weekend and come back to a full tank\./g, '3x speed, unlimited energy, higher chance for critical part upgrades for 3 days AND raises AFK cap to 72 hours.');

src = src.replace('z-[1000]', 'z-[1005]');

fs.writeFileSync(file, src);
