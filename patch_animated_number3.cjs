const fs = require('fs');
const file = 'src/components/AnimatedNumber.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'interface AnimatedNumberProps {\n  value: number;\n  className?: string;\n}',
  'interface AnimatedNumberProps {\n  value: number;\n  className?: string;\n  format?: "standard" | "abbreviated";\n}'
);

src = src.replace(
  'export function AnimatedNumber({ value, className }: AnimatedNumberProps) {',
  'export function AnimatedNumber({ value, className, format = "abbreviated" }: AnimatedNumberProps) {'
);

src = src.replace(
  'formatAbbreviated(Math.floor(latest)),',
  'format === "abbreviated" ? formatAbbreviated(Math.floor(latest)) : Math.floor(latest).toLocaleString(),'
);

fs.writeFileSync(file, src);
