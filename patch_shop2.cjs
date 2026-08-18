const fs = require('fs');
const file = 'src/screens/ShopScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('Overclock: 24h Auto-Mechanic', '1 Day Boost');
src = src.replace('Auto-collects Scrap and triples your passive income for 24 hours — the fastest way to            your next trade-in.', 'Get 3x speed, unlimited energy, and a higher chance for critical part upgrades for a full 24 hours!');
src = src.replace('Triples your passive Scrap income for a full 3 days AND raises your AFK offline cap to            72 hours while active — go dark for the whole weekend and come back to a full tank.', 'Get 3x speed, unlimited energy, and a higher chance for critical part upgrades for 3 days AND raise your AFK cap to 72 hours!');

// Fix z-index for the modal wrapper to be above Airdrop/Profile buttons which usually have z-50
src = src.replace('z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm', 'z-[1000] fixed inset-0 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm');

// Fix the button color to match Telegram Stars (amber/yellow) instead of white/cyan
src = src.replace(/text-\[\#b026ff\]/g, 'text-amber');
src = src.replace(/border-\[\#b026ff\]/g, 'border-amber');
src = src.replace(/bg-\[\#b026ff\]\/10/g, 'bg-amber/10');
src = src.replace(/bg-\[\#b026ff\]\/5/g, 'bg-amber/5');
src = src.replace(/shadow-\[0_0_20px_rgba\(176,38,255,0.35\)\]/g, 'shadow-[0_0_20px_rgba(255,149,0,0.35)]');
src = src.replace(/shadow-\[0_0_16px_rgba\(176,38,255,0.3\)\]/g, 'shadow-[0_0_16px_rgba(255,149,0,0.3)]');
src = src.replace(/border-\[\#b026ff\]\/40/g, 'border-amber/40');

fs.writeFileSync(file, src);
