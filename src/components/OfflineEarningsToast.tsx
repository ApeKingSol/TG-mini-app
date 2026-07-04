import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../game/store/GameStore';

const AUTO_DISMISS_MS = 4000;

export function OfflineEarningsToast() {
  const offlineEarnings = useGameStore((state) => state.offlineEarnings);
  const dismiss = useGameStore((state) => state.dismissOfflineEarnings);

  useEffect(() => {
    if (offlineEarnings === null) return;
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [offlineEarnings, dismiss]);

  return (
    <AnimatePresence>
      {offlineEarnings !== null && (
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          onClick={dismiss}
          className="fixed inset-x-4 top-4 z-50 cursor-pointer rounded-xl border border-neon-cyan/40 bg-bg-panel/95 px-4 py-3 text-center shadow-lg backdrop-blur"
        >
          <p className="font-display text-sm font-semibold text-neon-cyan">
            Welcome back!
          </p>
          <p className="text-xs text-neutral-300">
            +{Math.floor(offlineEarnings).toLocaleString()} Scrap earned while
            away
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
