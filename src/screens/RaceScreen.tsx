import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Lock, Package, ShieldAlert, Zap, type LucideIcon } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import { Tachometer } from '../components/Tachometer';
import { SYNDICATE_DRAG, getCarStats } from '../game/config/economy';

type RaceView = 'hub' | 'syndicate-drag';

export function RaceScreen() {
  const [view, setView] = useState<RaceView>('hub');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="pt-4"
    >
      {view === 'hub' ? (
        <RaceHub onSelectDrag={() => setView('syndicate-drag')} />
      ) : (
        <SyndicateDragRace onExit={() => setView('hub')} />
      )}
    </motion.div>
  );
}

interface RaceHubProps {
  onSelectDrag: () => void;
}

function RaceHub({ onSelectDrag }: RaceHubProps) {
  const neon = useGameStore((state) => state.neon);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neon-magenta/40 bg-neon-magenta/10 p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-neon-magenta/80">
          Syndicate Balance
        </p>
        <p className="mt-1 font-display text-3xl font-bold tabular-nums text-neon-magenta drop-shadow-[0_0_10px_rgba(255,46,230,0.5)]">
          {neon} NEON
        </p>
      </div>

      <p className="text-center text-xs uppercase tracking-widest text-neutral-500">
        Select a Game Mode
      </p>

      <ModeCard
        icon={Zap}
        title="Syndicate Drag"
        subtitle="PvP Betting · Timed-Shift Racing"
        accentClass="border-neon-cyan/40 bg-neon-cyan/5 text-neon-cyan"
        onClick={onSelectDrag}
      />
      <ModeCard
        icon={Package}
        title="Smuggler's Run"
        subtitle="Risk/Reward Convoy Run"
        locked
      />
      <ModeCard icon={ShieldAlert} title="Night Siege" subtitle="Convoy Defense" locked />
    </div>
  );
}

interface ModeCardProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  accentClass?: string;
  locked?: boolean;
  onClick?: () => void;
}

function ModeCard({ icon: Icon, title, subtitle, accentClass, locked, onClick }: ModeCardProps) {
  return (
    <motion.button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      whileHover={!locked ? { scale: 1.02 } : undefined}
      whileTap={!locked ? { scale: 0.98 } : undefined}
      className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
        locked
          ? 'cursor-not-allowed border-neutral-800 bg-bg-panel/60 opacity-60'
          : (accentClass ?? 'border-neutral-800 bg-bg-panel')
      }`}
    >
      <Icon className="h-8 w-8 shrink-0" strokeWidth={1.75} />
      <div>
        <p className="font-display text-sm font-bold uppercase tracking-wide">{title}</p>
        <p className="text-xs text-neutral-500">{subtitle}</p>
      </div>
      {locked && (
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-neutral-700 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-widest text-neutral-400">
          <Lock className="h-3 w-3" strokeWidth={2} />
          Soon
        </span>
      )}
    </motion.button>
  );
}

type DragRaceState = 'idle' | 'racing' | 'won' | 'lost' | 'blown';

interface SyndicateDragRaceProps {
  onExit: () => void;
}

function SyndicateDragRace({ onExit }: SyndicateDragRaceProps) {
  const neon = useGameStore((state) => state.neon);
  const carTier = useGameStore((state) => state.carTier);
  const installedUpgrades = useGameStore((state) => state.installedUpgrades);
  const spendNeon = useGameStore((state) => state.spendNeon);
  const addNeon = useGameStore((state) => state.addNeon);

  const stats = getCarStats(carTier, installedUpgrades);

  // Acceleration widens the Blue Zone (easier timing); TopSpeed raises how much progress
  // one well-timed shift is worth. Both are pure functions of stats already computed above,
  // so they don't need to live in state — they can only change between races (trading in a
  // car or installing a perk both happen outside the Anti-Stall/Drag mini-games).
  const zoneWidth = Math.min(
    100,
    SYNDICATE_DRAG.BASE_ZONE_WIDTH +
      Math.max(0, stats.acceleration - 100) * SYNDICATE_DRAG.ZONE_WIDTH_PER_ACCELERATION,
  );
  const zoneMin = Math.max(0, SYNDICATE_DRAG.ZONE_CENTER - zoneWidth / 2);
  const zoneMax = Math.min(100, SYNDICATE_DRAG.ZONE_CENTER + zoneWidth / 2);
  const progressPerShift =
    SYNDICATE_DRAG.BASE_PROGRESS_PER_SHIFT +
    Math.max(0, stats.topSpeed - 100) * SYNDICATE_DRAG.PROGRESS_PER_SHIFT_PER_TOP_SPEED;

  const [raceState, setRaceState] = useState<DragRaceState>('idle');
  const [needleValue, setNeedleValue] = useState(0);
  const [playerProgress, setPlayerProgress] = useState(0);
  const [aiProgress, setAiProgress] = useState(0);
  const [playerHp, setPlayerHp] = useState(stats.durability);

  // Refs mirror the state above as the single source of truth read *inside* handlers and
  // the rAF loop — same reasoning as the Anti-Stall mini-game: reading React state directly
  // risks acting on a one-render-stale value if two updates land before a re-render commits.
  const raceStateRef = useRef<DragRaceState>('idle');
  const raceStartRef = useRef(0);
  const playerProgressRef = useRef(0);
  const playerHpRef = useRef(stats.durability);
  const rafRef = useRef<number | null>(null);

  // Needle sweeps 0 -> 100 -> 0 as a triangle wave, purely as a function of elapsed wall-
  // clock time — not accumulated per rAF frame — so it stays correct even if rAF fires
  // sparsely (the same lesson learned fixing the Anti-Stall RPM needle on iOS).
  const getCurrentNeedle = () => {
    const elapsedSeconds = (performance.now() - raceStartRef.current) / 1000;
    const cyclePosition =
      (elapsedSeconds % SYNDICATE_DRAG.NEEDLE_SWEEP_SECONDS) / SYNDICATE_DRAG.NEEDLE_SWEEP_SECONDS;
    return cyclePosition < 0.5 ? cyclePosition * 200 : (1 - cyclePosition) * 200;
  };

  const canAffordBet = neon >= SYNDICATE_DRAG.BET_NEON;

  const startRace = () => {
    if (!canAffordBet || !spendNeon(SYNDICATE_DRAG.BET_NEON, 'Syndicate Drag — Bet')) return;
    playerProgressRef.current = 0;
    playerHpRef.current = stats.durability;
    setPlayerProgress(0);
    setAiProgress(0);
    setPlayerHp(stats.durability);
    raceStartRef.current = performance.now();
    raceStateRef.current = 'racing';
    setRaceState('racing');
  };

  useEffect(() => {
    if (raceState !== 'racing') return;

    const step = () => {
      const elapsedSeconds = (performance.now() - raceStartRef.current) / 1000;
      setNeedleValue(getCurrentNeedle());

      const nextAiProgress = Math.min(100, elapsedSeconds * SYNDICATE_DRAG.AI_PROGRESS_PER_SECOND);
      setAiProgress(nextAiProgress);

      if (nextAiProgress >= 100 && raceStateRef.current === 'racing') {
        raceStateRef.current = 'lost';
        setRaceState('lost');
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceState]);

  const handleShift = () => {
    if (raceStateRef.current !== 'racing') return;
    const currentNeedle = getCurrentNeedle();
    const inZone = currentNeedle >= zoneMin && currentNeedle <= zoneMax;

    if (inZone) {
      const nextProgress = Math.min(100, playerProgressRef.current + progressPerShift);
      playerProgressRef.current = nextProgress;
      setPlayerProgress(nextProgress);
      if (nextProgress >= 100) {
        raceStateRef.current = 'won';
        setRaceState('won');
        addNeon(SYNDICATE_DRAG.WIN_PAYOUT_NEON, 'Syndicate Drag — Win');
      }
      return;
    }

    const nextHp = Math.max(0, playerHpRef.current - SYNDICATE_DRAG.MISSED_SHIFT_DAMAGE);
    playerHpRef.current = nextHp;
    setPlayerHp(nextHp);
    if (nextHp <= 0) {
      raceStateRef.current = 'blown';
      setRaceState('blown');
    }
  };

  const reset = () => setRaceState('idle');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 text-xs text-neutral-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Hub
        </button>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-neon-cyan">
          Syndicate Drag
        </p>
        <span className="text-xs font-medium tabular-nums text-neon-magenta">{neon} NEON</span>
      </div>

      {raceState === 'idle' && (
        <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-neutral-500">Entry Bet</p>
          <p className="mt-1 font-display text-2xl font-bold text-neon-magenta">
            {SYNDICATE_DRAG.BET_NEON} NEON
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Win pays {SYNDICATE_DRAG.WIN_PAYOUT_NEON} NEON after the Syndicate's 10% commission.
          </p>
          <motion.button
            type="button"
            onClick={startRace}
            disabled={!canAffordBet}
            whileHover={canAffordBet ? { scale: 1.05 } : undefined}
            whileTap={canAffordBet ? { scale: 0.95 } : undefined}
            className="mt-4 w-full rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 py-2.5 text-sm font-bold text-neon-cyan transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600"
          >
            Place Bet &amp; Race
          </motion.button>
          {!canAffordBet && <p className="mt-2 text-xs text-red-400">Not enough NEON</p>}
        </div>
      )}

      {raceState === 'racing' && (
        <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4">
          <Tachometer rpm={needleValue} zoneMin={zoneMin} zoneMax={zoneMax} zoneColor="#38bdf8" />
          <p className="-mt-2 text-center text-xs text-neutral-600">
            Tap SHIFT inside the Blue Zone
          </p>

          <div className="mt-3 space-y-2">
            <RaceProgressBar label="You" value={playerProgress} colorClass="bg-neon-cyan" />
            <RaceProgressBar label="Rival" value={aiProgress} colorClass="bg-red-500" instant />
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
              <span>Engine HP</span>
              <span className="tabular-nums">
                {Math.round(playerHp)} / {stats.durability}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <motion.div
                className="h-full origin-left rounded-full bg-green-400"
                animate={{ scaleX: playerHp / stats.durability }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              />
            </div>
          </div>

          <motion.button
            type="button"
            onClick={handleShift}
            whileTap={{ scale: 0.95 }}
            className="mt-4 w-full rounded-full border-2 border-neon-cyan bg-neon-cyan/10 py-4 font-display text-base font-extrabold tracking-wide text-neon-cyan"
          >
            SHIFT
          </motion.button>
        </div>
      )}

      {(raceState === 'won' || raceState === 'lost' || raceState === 'blown') && (
        <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4 text-center">
          {raceState === 'won' && (
            <p className="text-sm font-medium text-green-400">
              You win the drag! +{SYNDICATE_DRAG.WIN_PAYOUT_NEON} NEON (after commission).
            </p>
          )}
          {raceState === 'lost' && (
            <p className="text-sm font-medium text-red-400">
              The Rival crossed first — {SYNDICATE_DRAG.BET_NEON} NEON lost to the Syndicate.
            </p>
          )}
          {raceState === 'blown' && (
            <p className="text-sm font-medium text-red-400">
              BLOWN ENGINE — the car couldn't take it. {SYNDICATE_DRAG.BET_NEON} NEON lost.
            </p>
          )}
          <motion.button
            type="button"
            onClick={reset}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-3 w-full rounded-lg border border-neutral-700 py-2.5 text-sm font-medium text-neutral-300"
          >
            Race Again
          </motion.button>
        </div>
      )}
    </div>
  );
}

interface RaceProgressBarProps {
  label: string;
  value: number;
  colorClass: string;
  /** Skips the Framer Motion transition for bars driven by a continuous per-frame value
   * (the AI's fill, recomputed fresh from elapsed time every rAF tick) — animating *toward*
   * a target that itself moves every frame just makes the bar chase a perpetually-stale
   * position, the exact bug fixed on the Garage's Calibration bar. The player's own bar only
   * changes on discrete shift taps, so an eased transition there reads as a satisfying
   * "surge" instead of introducing lag. */
  instant?: boolean;
}

function RaceProgressBar({ label, value, colorClass, instant }: RaceProgressBarProps) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-800">
        {instant ? (
          <div
            className={`h-full origin-left rounded-full ${colorClass}`}
            style={{ transform: `scaleX(${value / 100})` }}
          />
        ) : (
          <motion.div
            className={`h-full origin-left rounded-full ${colorClass}`}
            animate={{ scaleX: value / 100 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        )}
      </div>
    </div>
  );
}
