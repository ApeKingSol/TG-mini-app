const fs = require('fs');
const file = 'src/screens/ShopScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  "type BoostItem = 'overclock_24h' | 'mega_overclock_72h';",
  "type BoostItem = 'overclock_24h' | 'mega_overclock_72h' | 'buy_neon_50' | 'buy_neon_200' | 'buy_neon_1000';"
);

src = src.replace(
  'Overclock: 24h Auto-Mechanic',
  '1 Day Boost'
);

src = src.replace(
  'Auto-collects Scrap and triples your passive income for 24 hours — the fastest way to            your next trade-in.',
  '3x speed (income & collection), unlimited energy, higher chance for critical part upgrades for 1 day.'
);

src = src.replace(
  'Mega Overclock (72H)',
  '3 Days Boost'
);

src = src.replace(
  'Triples your passive Scrap income for a full 3 days AND raises your AFK offline cap to            72 hours while active — go dark for the whole weekend and come back to a full tank.',
  '3x speed, unlimited energy, higher chance for critical part upgrades for 3 days AND raises AFK cap to 72 hours.'
);

// Add Neon section
const neonSection = `
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-neon-cyan">
            <Sparkles className="h-4 w-4" strokeWidth={2} />
            <p className="font-display text-xs font-bold uppercase tracking-widest">
              Buy NEON
            </p>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            Purchase premium currency with Telegram Stars.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              { id: 'buy_neon_50', neon: 50, price: 15 },
              { id: 'buy_neon_200', neon: 200, price: 49 },
              { id: 'buy_neon_1000', neon: 1000, price: 499 }
            ].map((pkg) => (
              <motion.button
                key={pkg.id}
                type="button"
                onClick={() => handleBuy(pkg.id as BoostItem)}
                disabled={purchaseDisabled}
                whileHover={!purchaseDisabled ? { scale: 1.05 } : undefined}
                whileTap={!purchaseDisabled ? { scale: 0.95 } : undefined}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-neon-cyan/50 bg-neon-cyan/10 p-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="flex items-center gap-1 font-display text-sm font-bold text-neon-cyan">
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                  {pkg.neon}
                </span>
                <div className="flex items-center gap-1 rounded bg-black/40 px-2 py-1 text-[10px] font-bold tabular-nums text-amber">
                  {isPurchasing || (isConfirmingPayment && pendingItemRef.current === pkg.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
                  ) : (
                    <Star className="h-3 w-3" fill="currentColor" />
                  )}
                  {pkg.price}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
`;

src = src.replace(
  '<div className="mt-4">',
  neonSection + '\n        <div className="mt-4">'
);

src = src.replace(
  'className="panel-cut max-h-[85vh] w-full max-w-sm overflow-y-auto border border-neon-cyan/50 bg-bg-panel p-4 text-left shadow-lg scrollbar-hide"',
  'className="panel-cut max-h-[85vh] w-full max-w-sm overflow-y-auto border border-neon-cyan/50 bg-bg-panel p-4 pb-12 text-left shadow-lg scrollbar-hide"'
);

fs.writeFileSync(file, src);
