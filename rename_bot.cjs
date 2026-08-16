const fs = require('fs');

function replaceInFile(file) {
  let src = fs.readFileSync(file, 'utf8');
  src = src.replace(/Syndicate Bot/g, 'AI Racer');
  src = src.replace(/syndicate bot/g, 'AI Racer');
  fs.writeFileSync(file, src);
}

replaceInFile('src/screens/RaceScreen.tsx');
replaceInFile('src/game/config/economy.ts');
