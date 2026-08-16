const fs = require('fs');
const file = 'src/screens/RaceScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  "recordRaceResult(finalWinner === 'player' ? 'win' : 'loss');",
  "if (raceMode === 'player') {\n          recordRaceResult(finalWinner === 'player' ? 'win' : 'loss');\n        }"
);

fs.writeFileSync(file, src);
