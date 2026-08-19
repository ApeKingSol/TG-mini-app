const fs = require('fs');
const file = 'src/components/CurrencyBar.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  '<AnimatedNumber\n          value={neon}\n          className="mt-1 block break-all font-display text-lg font-semibold leading-tight text-neon-magenta tabular-nums"\n        />',
  '<AnimatedNumber\n          value={neon}\n          format="standard"\n          className="mt-1 block break-all font-display text-lg font-semibold leading-tight text-neon-magenta tabular-nums"\n        />'
);

fs.writeFileSync(file, src);
