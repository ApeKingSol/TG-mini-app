const fs = require('fs');
const file = 'src/screens/LeaderboardScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('.then(res => res.json())', '.then(res => { if (!res.ok) throw new Error("Network error"); return res.json(); })');

fs.writeFileSync(file, src);
