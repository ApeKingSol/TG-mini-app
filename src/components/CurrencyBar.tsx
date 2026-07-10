import { useGameStore } from '../game/store/GameStore';
import { AnimatedNumber } from './AnimatedNumber';
import { Panel } from './Panel';

export function CurrencyBar() {
  const scrap = useGameStore((state) => state.scrap);
  const neon = useGameStore((state) => state.neon);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Panel accent="neutral" greeble="SYS.SALV" className="overflow-hidden p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Scrap</p>
        <AnimatedNumber
          value={Math.floor(scrap)}
          className="mt-1 block break-all font-display text-lg font-semibold leading-tight text-scrap tabular-nums"
        />
      </Panel>
      <Panel accent="magenta" greeble="SYS.SYN" className="overflow-hidden p-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Neon</p>
        <AnimatedNumber
          value={neon}
          className="mt-1 block break-all font-display text-lg font-semibold leading-tight text-neon-magenta tabular-nums"
        />
      </Panel>
    </div>
  );
}
