const fs = require('fs');
const file = 'src/game/store/GameStore.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'if (energy < ECONOMY.MERGE_ENERGY_COST) return null;',
  `const now = Date.now();
        const boostActive = get().boostEndsAt !== null && get().boostEndsAt! > now;
        if (!boostActive && energy < ECONOMY.MERGE_ENERGY_COST) return null;`
);

src = src.replace(
  'const isCrit = Math.random() < ECONOMY.MERGE_CRIT_CHANCE;',
  `const critChance = boostActive ? ECONOMY.MERGE_CRIT_CHANCE * 3 : ECONOMY.MERGE_CRIT_CHANCE; // Triple crit chance when boosted
        const isCrit = Math.random() < critChance;`
);

src = src.replace(
  'energy: state.energy - ECONOMY.MERGE_ENERGY_COST,',
  'energy: boostActive ? state.energy : state.energy - ECONOMY.MERGE_ENERGY_COST,'
);

fs.writeFileSync(file, src);
