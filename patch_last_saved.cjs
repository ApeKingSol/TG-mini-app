const fs = require('fs');
const file = 'src/game/store/GameStore.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'lastSaved: Date.now(),',
  'lastSaved: 0,'
);

// We need to make sure migrate still stamps Date.now() so version bumps STILL wipe the cloud save!
src = src.replace(
  'const fresh = createInitialPlayerState();',
  'const fresh = createInitialPlayerState();\n        fresh.lastSaved = Date.now();'
);

fs.writeFileSync(file, src);
