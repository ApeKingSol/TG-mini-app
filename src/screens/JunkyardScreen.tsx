import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../game/store/GameStore';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { ScrapPileIcon } from '../components/ScrapPileIcon';

interface FloatingText {
  id: string;
  x: number;
  y: number;
  isCrit: boolean;
  amount: number;
}

const FLOAT_DURATION_MS = 800;

export function JunkyardScreen() {
  const scrap = useGameStore((state) => state.scrap);
  const scrapPerSecond = useGameStore((state) => state.scrapPerSecond);
  const handleTap = useGameStore((state) => state.handleTap);

  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
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
    </motion.div>
  );
}
