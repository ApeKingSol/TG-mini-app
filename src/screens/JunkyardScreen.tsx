import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../game/store/GameStore';
import { AnimatedNumber } from '../components/AnimatedNumber';
import type { Upgrade } from '../game/types';

interface FloatingText {
  id: string;
  x: number;
  y: number;
  isCrit: boolean;
  amount: number;
}

interface Spark {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
  color: string;
}

const FLOAT_DURATION_MS = 800;
const SPARK_DURATION_MS = 500;
const SPARK_COUNT = 7;
const SPARK_COLORS = ['#ffcf5c', '#ff9f3f', '#fff2b0'];

/** A small shower of particles flung outward from the tap point at random angles/distances —
 * "grinding metal" flavor for a scrap pile, not a generic confetti burst. */
function createSparkBurst(x: number, y: number): Spark[] {
  return Array.from({ length: SPARK_COUNT }, () => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 26 + Math.random() * 34;
    return {
      id: crypto.randomUUID(),
      x,
      y,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 10, // slight upward bias, like real sparks under gravity-ish drift
      size: 3 + Math.random() * 3,
      color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
    };
  });
}

/** scrapPerSecond now grows multiplicatively (a few % per calibration/trade-in — see
 * economy.ts), so early-game increments are genuinely small in absolute terms. A flat
 * toFixed(1) rounds most single installs away to nothing visible (0.5 -> 0.515 both display
 * as "0.5"), which is exactly what made a real, working income boost look like a no-op.
 * More decimals for small values keeps every install visibly reflected; large late-game
 * values fall back to whole numbers with thousands separators instead of noisy decimals. */
function formatScrapRate(value: number): string {
  if (value < 10) return value.toFixed(2);
  if (value < 100) return value.toFixed(1);
  return Math.round(value).toLocaleString();
}

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

  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const tapAreaRef = useRef<HTMLDivElement>(null);

  const handleTapArea = (event: React.MouseEvent<HTMLButtonElement>) => {
    const result = handleTap();

    const rect = tapAreaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const tapX = event.clientX - rect.left;
    const tapY = event.clientY - rect.top;

    const id = crypto.randomUUID();
    setFloatingTexts((texts) => [
      ...texts,
      { id, x: tapX, y: tapY, isCrit: result.isCrit, amount: result.amount },
    ]);
    window.setTimeout(() => {
      setFloatingTexts((texts) => texts.filter((t) => t.id !== id));
    }, FLOAT_DURATION_MS);

    const burst = createSparkBurst(tapX, tapY);
    setSparks((current) => [...current, ...burst]);
    window.setTimeout(() => {
      const burstIds = new Set(burst.map((spark) => spark.id));
      setSparks((current) => current.filter((spark) => !burstIds.has(spark.id)));
    }, SPARK_DURATION_MS);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center gap-6 pt-8 text-center"
    >
      <p className="w-full max-w-xs text-left text-xs uppercase tracking-widest text-neutral-500">
        Junkyard
      </p>

      <div ref={tapAreaRef} className="relative flex items-center justify-center">
        {/* Pulsating glow behind the pile, hinting this junk is worth something — sized and
           intensified to match the bigger, brighter pile image above it. */}
        <div className="pointer-events-none absolute h-44 w-44 animate-pulse rounded-full bg-cyan-500/30 blur-3xl" />

        <motion.button
          type="button"
          onClick={handleTapArea}
          animate={{ rotate: [0, -4, 4, 0], y: [0, -5, 0] }}
          transition={{
            rotate: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
            y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
          }}
          whileTap={{ scale: 0.85 }}
          className="relative cursor-pointer"
        >
          {/* icon-scrap-tap.png has a real alpha channel (keyed out in the editor from the
             source sprite sheet's near-black backdrop, not a CSS trick) — no background,
             border-radius, or blend-mode needed to make it sit cleanly on the app's photo
             background. `brightness`/`saturate` (not drop-shadow) is what lifts it: the pile's
             alpha channel has lots of small holes (gaps between wires/parts got keyed out
             along with the background), and a blurred drop-shadow fills every one of those
             with a hazy cyan cloud instead of a clean rim glow — brightness/saturate boost the
             pixels that are already there instead, so the holes stay clean. */}
          <img
            src="/icon-scrap-tap.png"
            alt="Salvage the scrap pile"
            className="h-40 w-40 object-contain brightness-125 saturate-125"
          />
        </motion.button>

        <AnimatePresence>
          {sparks.map((spark) => (
            <motion.span
              key={spark.id}
              initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              animate={{ opacity: 0, x: spark.dx, y: spark.dy, scale: 0.3 }}
              transition={{ duration: SPARK_DURATION_MS / 1000, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                left: spark.x,
                top: spark.y,
                translateX: '-50%',
                translateY: '-50%',
                width: spark.size,
                height: spark.size,
                backgroundColor: spark.color,
                boxShadow: `0 0 6px 1px ${spark.color}`,
              }}
              className="pointer-events-none select-none rounded-full"
            />
          ))}
        </AnimatePresence>

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
          +{formatScrapRate(scrapPerSecond)}/sec
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
                <div className="min-w-0">
                  <p
                    className={`truncate font-display text-sm font-bold uppercase tracking-wide text-white ${
                      // Orbitron's capital E sits with more left bearing than R/A, so "Expanded
                      // Battery" reads as shifted right of the other two rows even though all
                      // three boxes start at the same edge — nudge just this glyph to compensate.
                      upgrade.id === 'expanded-battery' ? '-ml-1' : ''
                    }`}
                  >
                    {upgrade.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                    Owned {upgrade.owned} · {formatUpgradeBenefit(upgrade)}
                  </p>
                </div>
                <span className="shrink-0 pl-3 text-right font-display text-sm font-bold text-neon-cyan tabular-nums">
                  {Math.round(upgrade.cost).toLocaleString()}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
