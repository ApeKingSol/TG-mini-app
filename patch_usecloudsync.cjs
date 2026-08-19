const fs = require('fs');
const file = 'src/hooks/useCloudSync.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'const pullRemoteRef = useRef<() => void>(() => {});',
  `const pullRemoteRef = useRef<() => void>(() => {});
  const isPullingRef = useRef(false);`
);

src = src.replace(
  'const pullRemote = () => {',
  `const pullRemote = () => {
      isPullingRef.current = true;`
);

src = src.replace(
  'hasPulledInitialStateRef.current = true;',
  `hasPulledInitialStateRef.current = true;
          isPullingRef.current = false;`
);

src = src.replace(
  '// Deliberately does not set hasPulledInitialStateRef — see its doc comment above.',
  `// Deliberately does not set hasPulledInitialStateRef — see its doc comment above.
          isPullingRef.current = false;`
);

src = src.replace(
  'if (!hasPulledInitialStateRef.current) return;',
  `if (!hasPulledInitialStateRef.current) return;
      if (isPullingRef.current) return;`
);

fs.writeFileSync(file, src);
