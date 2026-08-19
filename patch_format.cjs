const fs = require('fs');
const file = 'src/lib/format.ts';

const src = `export function formatAbbreviated(val: number): string {
  if (val >= 1_000_000_000) return (val / 1_000_000_000).toFixed(3).replace(/\\.?0+$/, '') + 'B';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(3).replace(/\\.?0+$/, '') + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(3).replace(/\\.?0+$/, '') + 'K';
  return val.toLocaleString();
}
`;

fs.writeFileSync(file, src);
