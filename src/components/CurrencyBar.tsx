import { useGameStore } from '../game/store/GameStore';
import { AnimatedNumber } from './AnimatedNumber';

export function CurrencyBar() {
  const scrap = useGameStore((state) => state.scrap);
  const neon = useGameStore((state) => state.neon);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Scrap</p>
        <AnimatedNumber
          value={Math.floor(scrap)}
          className="mt-1 block font-display text-2xl font-semibold text-scrap tabular-nums"
        />
      </div>
      <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Neon</p>
        <AnimatedNumber
          value={neon}
          className="mt-1 block font-display text-2xl font-semibold text-neon-magenta tabular-nums"
        />
      </div>
    </div>
  );
}
