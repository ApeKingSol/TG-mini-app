const fs = require('fs');
const file = 'src/components/AnimatedNumber.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'Math.floor(latest).toLocaleString()',
  `(() => {
      const val = Math.floor(latest);
      if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(1).replace(/\\.0$/, '') + 'B';
      if (val >= 1_000_000) return (val / 1_000_000).toFixed(1).replace(/\\.0$/, '') + 'M';
      if (val >= 1_000) return (val / 1_000).toFixed(1).replace(/\\.0$/, '') + 'K';
      return val.toLocaleString();
    })()`
);

fs.writeFileSync(file, src);
