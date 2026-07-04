import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import { RACE } from '../game/config/economy';
import type { CarHpStatus } from '../game/types';

type RaceState = 'idle' | 'racing' | 'won' | 'lost';

function rollWin(hpStatus: CarHpStatus): boolean {
  const chance = RACE.BASE_WIN_CHANCE + RACE.WIN_CHANCE_MODIFIER[hpStatus];
  return Math.random() < Math.min(0.95, Math.max(0.05, chance));
}

export function RaceScreen() {
  const scrap = useGameStore((state) => state.scrap);
  const car = useGameStore((state) => state.car);
  const hpStatus = useGameStore((state) => state.getCarHpStatus());
  const spendScrap = useGameStore((state) => state.spendScrap);
  const addScrap = useGameStore((state) => state.addScrap);
  const damageCar = useGameStore((state) => state.damageCar);

  const [raceState, setRaceState] = useState<RaceState>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const canRace = car.hp > 0 && scrap >= RACE.ENTRY_FEE_SCRAP;

  const startRace = () => {
    if (!canRace || !spendScrap(RACE.ENTRY_FEE_SCRAP)) return;
    setRaceState('racing');

    const won = rollWin(hpStatus);
    timeoutRef.current = setTimeout(() => {
      if (won) {
        addScrap(RACE.REWARD_SCRAP);
      } else {
        damageCar(RACE.DAMAGE_ON_LOSS);
      }
      setRaceState(won ? 'won' : 'lost');
    }, RACE.DURATION_MS);
  };

  const reset = () => setRaceState('idle');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center gap-6 pt-8 text-center"
    >
      <Flag
        className="h-20 w-20 text-neon-magenta drop-shadow-[0_0_14px_rgba(255,46,230,0.65)]"
        strokeWidth={1.5}
      />

      <div className="w-full max-w-xs rounded-xl border border-neutral-800 bg-bg-panel p-4">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          Toll Road Run
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          Entry fee: {RACE.ENTRY_FEE_SCRAP} Scrap · Reward: {RACE.REWARD_SCRAP}{' '}
          Scrap
        </p>

        {raceState === 'racing' && (
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-neutral-800">
            <motion.div
              className="h-full rounded-full bg-neon-cyan"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: RACE.DURATION_MS / 1000, ease: 'linear' }}
            />
          </div>
        )}

        {raceState === 'won' && (
          <p className="mt-4 text-sm font-medium text-green-400">
            Made it through — +{RACE.REWARD_SCRAP} Scrap!
          </p>
        )}
        {raceState === 'lost' && (
          <p className="mt-4 text-sm font-medium text-red-400">
            Car took a beating — -{RACE.DAMAGE_ON_LOSS} HP. Repair it in the
            Garage.
          </p>
        )}

        {raceState === 'idle' && (
          <motion.button
            type="button"
            onClick={startRace}
            disabled={!canRace}
            whileHover={canRace ? { scale: 1.05 } : undefined}
            whileTap={canRace ? { scale: 0.95 } : undefined}
            className="mt-4 w-full rounded-lg bg-neon-magenta/10 border border-neon-magenta/40 py-2.5 text-sm font-medium text-neon-magenta transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600"
          >
            Start Race
          </motion.button>
        )}
        {(raceState === 'won' || raceState === 'lost') && (
          <motion.button
            type="button"
            onClick={reset}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-3 w-full rounded-lg border border-neutral-700 py-2.5 text-sm font-medium text-neutral-300"
          >
            Back
          </motion.button>
        )}

        {raceState === 'idle' && car.hp === 0 && (
          <p className="mt-2 text-xs text-red-400">
            Car is wrecked — repair it before racing.
          </p>
        )}
        {raceState === 'idle' && car.hp > 0 && scrap < RACE.ENTRY_FEE_SCRAP && (
          <p className="mt-2 text-xs text-red-400">Not enough Scrap</p>
        )}
      </div>
    </motion.div>
  );
}
