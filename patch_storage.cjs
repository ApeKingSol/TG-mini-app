const fs = require('fs');
const file = 'src/game/store/GameStore.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  "import { create } from 'zustand';",
  "import { create } from 'zustand';\nimport { createJSONStorage } from 'zustand/middleware';"
);

src = src.replace(
  "export const hadLocalSaveAtLoad = (() => {\n  try {\n    return localStorage.getItem(STORAGE_KEY) !== null;\n  } catch {\n    return false;\n  }\n})();",
  "let _hadLocalSaveAtLoad: boolean | null = null;\nexport function getHadLocalSaveAtLoad() {\n  if (_hadLocalSaveAtLoad === null) {\n    try {\n      _hadLocalSaveAtLoad = localStorage.getItem(getStorageKey()) !== null;\n    } catch {\n      _hadLocalSaveAtLoad = false;\n    }\n  }\n  return _hadLocalSaveAtLoad;\n}"
);

// We need to fix useCloudSync as well
const syncFile = 'src/hooks/useCloudSync.ts';
let syncSrc = fs.readFileSync(syncFile, 'utf8');
syncSrc = syncSrc.replace('hadLocalSaveAtLoad,', 'getHadLocalSaveAtLoad,');
syncSrc = syncSrc.replace('hadLocalSaveAtLoad)', 'getHadLocalSaveAtLoad())');
syncSrc = syncSrc.replace('!hadLocalSaveAtLoad', '!getHadLocalSaveAtLoad()');
fs.writeFileSync(syncFile, syncSrc);

src = src.replace(
  "name: STORAGE_KEY,",
  "name: 'dynamic-storage',\n      storage: createJSONStorage(() => ({\n        getItem: () => {\n          getHadLocalSaveAtLoad(); // Ensure it's evaluated before first read\n          return localStorage.getItem(getStorageKey());\n        },\n        setItem: (_, value) => localStorage.setItem(getStorageKey(), value),\n        removeItem: () => localStorage.removeItem(getStorageKey()),\n      })),"
);

fs.writeFileSync(file, src);
