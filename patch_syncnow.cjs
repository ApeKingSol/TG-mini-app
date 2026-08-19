const fs = require('fs');
const file = 'src/hooks/useCloudSync.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  '    lastPushedAtRef.current = -1;\n    pushIfChangedRef.current(false);',
  '    lastPushedAtRef.current = -1;\n    // The periodic interval will pick this up automatically within 2 seconds'
);

fs.writeFileSync(file, src);
