import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Store, X, Check } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ScrapPileIcon } from '../components/ScrapPileIcon';
import type { Upgrade } from '../game/types';

interface FloatingText {
  id: string;
  x: number;
  y: number;
  isCrit: boolean;
  amount: number;
}

const FLOAT_DURATION_MS = 800;

function formatUpgradeBenefit(upgrade: Upgrade): string {
  switch (upgrade.effect) {
    case 'scrapPerSecond':
      return `+${upgrade.boost.toFixed(1)}/sec`;
    case 'scrapPerClick':
      return `+${upgrade.boost} per tap`;
    case 'maxEnergy':
      return `+${upgrade.boost} Max Energy (Garage)`;
  }
}

export function JunkyardScreen() {
  const scrap = useGameStore((state) => state.scrap);
  const scrapPerSecond = useGameStore((state) => state.scrapPerSecond);
  const handleTap = useGameStore((state) => state.handleTap);
  const upgrades = useGameStore((state) => state.upgrades);
  const buyUpgrade = useGameStore((state) => state.buyUpgrade);
  const shopItems = useGameStore((state) => state.shopItems);
  const buyShopItem = useGameStore((state) => state.buyShopItem);

  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const tapAreaRef = useRef<HTMLDivElement>(null);

  const handleTapArea = (event: React.MouseEvent<HTMLButtonElement>) => {
    const result = handleTap();

    const rect = tapAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const id = crypto.randomUUID();
    setFloatingTexts((texts) => [
      ...texts,
      {
        id,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        isCrit: result.isCrit,
        amount: result.amount,
      },
    ]);
    window.setTimeout(() => {
      setFloatingTexts((texts) => texts.filter((t) => t.id !== id));
    }, FLOAT_DURATION_MS);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center gap-6 pt-8 text-center"
    >
      <div className="flex w-full max-w-xs items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Junkyard</p>
        <motion.button
          type="button"
          onClick={() => setIsShopOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1 rounded-md border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 text-xs font-semibold text-neon-cyan"
        >
          <Store className="h-3.5 w-3.5" strokeWidth={2} />
          SHOP
        </motion.button>
      </div>

      <div ref={tapAreaRef} className="relative flex items-center justify-center">
        {/* Pulsating glow behind the pile, hinting this junk is worth something */}
        <div className="pointer-events-none absolute h-28 w-28 animate-pulse rounded-full bg-cyan-500/20 blur-2xl" />

        <motion.button
          type="button"
          onClick={handleTapArea}
          animate={{ rotate: [0, -4, 4, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          whileTap={{ scale: 0.85 }}
          className="relative cursor-pointer"
        >
          <ScrapPileIcon className="h-20 w-20 drop-shadow-[0_0_14px_rgba(0,240,255,0.55)]" />
        </motion.button>

        <AnimatePresence>
          {floatingTexts.map((text) =>
            text.isCrit ? (
              <motion.span
                key={text.id}
                initial={{ opacity: 1, y: 0, scale: 0.6 }}
                animate={{ opacity: 0, y: -70, scale: 1.3 }}
                transition={{ duration: FLOAT_DURATION_MS / 1000, ease: 'easeOut' }}
                style={{ position: 'absolute', left: text.x, top: text.y, translateX: '-50%' }}
                className="pointer-events-none select-none whitespace-nowrap font-display text-2xl font-extrabold text-amber-300 drop-shadow-[0_0_12px_rgba(192,132,252,0.9)]"
              >
                CRIT +{text.amount}
              </motion.span>
            ) : (
              <motion.span
                key={text.id}
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0, y: -60 }}
                transition={{ duration: FLOAT_DURATION_MS / 1000, ease: 'easeOut' }}
                style={{ position: 'absolute', left: text.x, top: text.y, translateX: '-50%' }}
                className="pointer-events-none select-none font-display text-lg font-bold text-neon-cyan drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]"
              >
                +{text.amount}
              </motion.span>
            ),
          )}
        </AnimatePresence>
      </div>

      <div>
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Total Scrap
        </p>
        <AnimatedNumber
          value={Math.floor(scrap)}
          className="mt-1 block font-display text-4xl font-bold text-scrap tabular-nums"
        />
      </div>

      <div className="w-full max-w-xs rounded-xl border border-neutral-800 bg-bg-panel p-4">
        <p className="text-sm text-neutral-400">Tap the pile to salvage Scrap by hand.</p>
        <p className="mt-2 font-display text-lg text-neon-cyan">
          +{scrapPerSecond.toFixed(1)}/sec
        </p>
      </div>

      <div className="w-full max-w-xs text-left">
        <p className="mb-2 text-xs uppercase tracking-widest text-neutral-500">
          Upgrades
        </p>
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {upgrades.map((upgrade) => {
            const canAfford = scrap >= upgrade.cost;
            return (
              <motion.button
                key={upgrade.id}
                type="button"
                onClick={() => buyUpgrade(upgrade.id)}
                disabled={!canAfford}
                whileHover={canAfford ? { scale: 1.02 } : undefined}
                whileTap={canAfford ? { scale: 0.97 } : undefined}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-bg-panel px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-medium text-neutral-200">
                    {upgrade.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    Owned {upgrade.owned} · {formatUpgradeBenefit(upgrade)}
                  </p>
                </div>
                <span className="font-display text-sm text-neon-cyan tabular-nums">
                  {Math.round(upgrade.cost).toLocaleString()}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {isShopOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsShopOpen(false)}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-24 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: -24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -24, scale: 0.95 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-xs rounded-xl border border-neon-cyan/40 bg-bg-panel p-4 text-left shadow-lg"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-display text-sm font-bold uppercase tracking-widest text-neon-cyan">
                  Shop
                </p>
                <button
                  type="button"
                  onClick={() => setIsShopOpen(false)}
                  className="rounded-md p-1 text-neutral-500 hover:text-neutral-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-2 text-xs text-neutral-500">
                Cosmetic novelties. One of each — flex, don't stack.
              </p>

              <div className="flex flex-col gap-2">
                {shopItems.map((item) => {
                  const canAfford = scrap >= item.cost;
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      onClick={() => buyShopItem(item.id)}
                      disabled={!canAfford || item.owned}
                      whileHover={canAfford && !item.owned ? { scale: 1.02 } : undefined}
                      whileTap={canAfford && !item.owned ? { scale: 0.97 } : undefined}
                      className="flex items-center justify-between rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-neutral-200">{item.name}</p>
                        <p className="text-xs text-neutral-500">{item.description}</p>
                      </div>
                      {item.owned ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-400">
                          <Check className="h-3.5 w-3.5" /> Owned
                        </span>
                      ) : (
                        <span className="font-display text-sm text-neon-cyan tabular-nums">
                          {Math.round(item.cost).toLocaleString()}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
