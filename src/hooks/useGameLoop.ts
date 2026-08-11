import { useEffect } from 'react';
import { useGameStore } from '../game/store/GameStore';
import { ECONOMY } from '../game/config/economy';

/** Drives passive Scrap generation by ticking the store on an interval. Mount once, near the app root. */
export function useGameLoop() {
  const tick = useGameStore((state) => state.tick);

  useEffect(() => {
    const interval = setInterval(tick, ECONOMY.TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tick]);
}
