const fs = require('fs');
const file = 'src/game/store/GameStore.ts';
let src = fs.readFileSync(file, 'utf8');

const regex = /export const hadLocalSaveAtLoad = \(\(\) => \{.*?\n\}\)\(\);/s;
src = src.replace(regex, `let _hadLocalSaveAtLoad: boolean | null = null;
export function getHadLocalSaveAtLoad(): boolean {
  if (_hadLocalSaveAtLoad === null) {
    try {
      _hadLocalSaveAtLoad = localStorage.getItem(getStorageKey()) !== null;
    } catch {
      _hadLocalSaveAtLoad = true;
    }
  }
  return _hadLocalSaveAtLoad;
}`);

fs.writeFileSync(file, src);
