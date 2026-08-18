const fs = require('fs');
const file = 'src/screens/ShopScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('const boostEndsAtBeforePurchaseRef = useRef<number | null>(null);', 'const boostEndsAtBeforePurchaseRef = useRef<number | null>(null);\n  const neonBeforePurchaseRef = useRef<number | null>(null);');

src = src.replace(
  'const megaBefore = megaBoostEndsAtBeforePurchaseRef.current;',
  `const megaBefore = megaBoostEndsAtBeforePurchaseRef.current;
    const neonBefore = neonBeforePurchaseRef.current;`
);

src = src.replace(
  'const landed = pendingItemRef.current === \'mega_overclock_72h\' ? megaLanded : boostLanded;',
  `const neonLanded = neonBefore !== null && neon > neonBefore;
    const landed = pendingItemRef.current === 'mega_overclock_72h' ? megaLanded : 
                   pendingItemRef.current?.startsWith('buy_neon') ? neonLanded : boostLanded;`
);

src = src.replace(
  `wasMega
          ? 'Mega Overclock activated — 72h of triple Scrap and an extended AFK cap!'
          : 'Overclock activated — the Auto-Mechanic is on the clock!',`,
  `wasMega
          ? 'Mega Overclock activated — 72h of triple Scrap and an extended AFK cap!'
          : pendingItemRef.current?.startsWith('buy_neon') ? 'NEON purchase successful!' : 'Overclock activated — the Auto-Mechanic is on the clock!',`
);

src = src.replace(
  `  }, [isConfirmingPayment, boostEndsAt, megaBoostEndsAt]);`,
  `  }, [isConfirmingPayment, boostEndsAt, megaBoostEndsAt, neon]);`
);

src = src.replace(
  'megaBoostEndsAtBeforePurchaseRef.current = megaBoostEndsAt;',
  `megaBoostEndsAtBeforePurchaseRef.current = megaBoostEndsAt;
      neonBeforePurchaseRef.current = neon;`
);

fs.writeFileSync(file, src);
