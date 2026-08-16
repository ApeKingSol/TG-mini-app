const fs = require('fs');
const file = 'src/screens/LeaderboardScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('export function LeaderboardScreen() {', 'export function LeaderboardScreen({ onBack }: { onBack: () => void }) {');
src = src.replace(
  '<div className="flex shrink-0 items-center justify-center border-b border-neon-cyan/20 bg-black/40 p-4 shadow-[0_4px_20px_rgba(0,240,255,0.1)]">',
  `<div className="flex shrink-0 items-center justify-between border-b border-neon-cyan/20 bg-black/40 p-4 shadow-[0_4px_20px_rgba(0,240,255,0.1)]">
        <button type="button" onClick={onBack} className="p-2 text-neutral-400 hover:text-white">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>`
);

fs.writeFileSync(file, src);
