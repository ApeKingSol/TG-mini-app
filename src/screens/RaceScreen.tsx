import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Gauge, Lock, Package, ShieldAlert, type LucideIcon } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import { AUTO_DRAG, getCarStats } from '../game/config/economy';
import type { CarStats } from '../game/types';

type RaceView = 'hub' | 'auto-drag';

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
      {view === 'hub' && <RaceHub onSelectAutoDrag={() => setView('auto-drag')} />}
      {view === 'auto-drag' && <AutoDragRace onExit={() => setView('hub')} />}
    </motion.div>
  );
}

interface RaceHubProps {
  onSelectAutoDrag: () => void;
}

function RaceHub({ onSelectAutoDrag }: RaceHubProps) {
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
        icon={Gauge}
        title="Auto-Drag"
        subtitle="Hands-Off Betting · Auto-Battler"
        accentClass="border-neon-magenta/40 bg-neon-magenta/5 text-neon-magenta"
        onClick={onSelectAutoDrag}
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

const AUTO_DRAG_FLOAT_DURATION_MS = 800;

type AutoDragState = 'betting' | 'racing' | 'finished';

interface FloatEvent {
  id: string;
  text: 'CRIT!' | 'DRIFT!';
}

/** Rolls the rival's stats once per race, jittered around the player's own — see
 * AUTO_DRAG.RIVAL_STAT_JITTER's doc comment for why. `durability` is carried through
 * unchanged only so the object satisfies CarStats; Auto-Drag never reads it (no HP/damage
 * mechanic in this mode). */
function rollRivalStats(playerStats: CarStats): CarStats {
  const jitter = () => 1 + (Math.random() * 2 - 1) * AUTO_DRAG.RIVAL_STAT_JITTER;
  return {
    topSpeed: playerStats.topSpeed * jitter(),
    acceleration: playerStats.acceleration * jitter(),
    durability: playerStats.durability,
    handling: playerStats.handling * jitter(),
  };
}

function getFillPerSecond(topSpeed: number): number {
  return (
    AUTO_DRAG.BASE_FILL_PER_SECOND +
    Math.max(0, topSpeed - 100) * AUTO_DRAG.FILL_PER_SECOND_PER_SPEED
  );
}

function getLaunchJump(acceleration: number): number {
  return (
    AUTO_DRAG.BASE_LAUNCH_JUMP + Math.max(0, acceleration - 100) * AUTO_DRAG.LAUNCH_JUMP_PER_ACCEL
  );
}

/** Clamped well below 1 — otherwise a heavily-upgraded car could approach guaranteed
 * slowdown immunity, which would make the resist roll pointless instead of just favorable. */
function getResistChance(handling: number): number {
  return Math.min(
    0.9,
    AUTO_DRAG.BASE_RESIST_CHANCE +
      Math.max(0, handling - 100) * AUTO_DRAG.RESIST_CHANCE_PER_HANDLING,
  );
}

interface AutoDragRaceProps {
  onExit: () => void;
}

function AutoDragRace({ onExit }: AutoDragRaceProps) {
  const neon = useGameStore((state) => state.neon);
  const carTier = useGameStore((state) => state.carTier);
  const installedUpgrades = useGameStore((state) => state.installedUpgrades);
  const spendNeon = useGameStore((state) => state.spendNeon);
  const addNeon = useGameStore((state) => state.addNeon);

  const stats = getCarStats(carTier, installedUpgrades);

  const [betAmount, setBetAmount] = useState<number>(AUTO_DRAG.BET_TIERS[0]);
  const [raceState, setRaceState] = useState<AutoDragState>('betting');
  const [playerProgress, setPlayerProgress] = useState(0);
  const [rivalProgress, setRivalProgress] = useState(0);
  const [playerFloats, setPlayerFloats] = useState<FloatEvent[]>([]);
  const [rivalFloats, setRivalFloats] = useState<FloatEvent[]>([]);
  const [winner, setWinner] = useState<'player' | 'rival' | null>(null);

  // Refs mirror the state above as the single source of truth read *inside* the rAF loop —
  // reading React state directly there risks acting on a one-render-stale value if two
  // updates land before a re-render commits (the same lesson from the Anti-Stall/Garage
  // calibration mini-game).
  const raceStateRef = useRef<AutoDragState>('betting');
  const raceStartRef = useRef(0);
  const playerProgressRef = useRef(0);
  const rivalProgressRef = useRef(0);
  const rivalStatsRef = useRef<CarStats>(stats);
  const lastEventCheckRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const canAffordBet = neon >= betAmount;
  const grossPayout = betAmount * AUTO_DRAG.GROSS_WIN_MULTIPLIER;
  const tax = Math.round(grossPayout * AUTO_DRAG.SYSTEM_TAX_RATE);
  const netPayout = grossPayout - tax;

  const pushPlayerFloat = (text: FloatEvent['text']) => {
    const id = crypto.randomUUID();
    setPlayerFloats((prev) => [...prev, { id, text }]);
    window.setTimeout(() => {
      setPlayerFloats((prev) => prev.filter((floatEvent) => floatEvent.id !== id));
    }, AUTO_DRAG_FLOAT_DURATION_MS);
  };

  const pushRivalFloat = (text: FloatEvent['text']) => {
    const id = crypto.randomUUID();
    setRivalFloats((prev) => [...prev, { id, text }]);
    window.setTimeout(() => {
      setRivalFloats((prev) => prev.filter((floatEvent) => floatEvent.id !== id));
    }, AUTO_DRAG_FLOAT_DURATION_MS);
  };

  const startRace = () => {
    if (!canAffordBet || !spendNeon(betAmount, 'Auto-Drag — Bet')) return;

    const rivalStats = rollRivalStats(stats);
    rivalStatsRef.current = rivalStats;

    const playerStart = Math.min(100, getLaunchJump(stats.acceleration));
    const rivalStart = Math.min(100, getLaunchJump(rivalStats.acceleration));
    playerProgressRef.current = playerStart;
    rivalProgressRef.current = rivalStart;
    setPlayerProgress(playerStart);
    setRivalProgress(rivalStart);
    setPlayerFloats([]);
    setRivalFloats([]);
    setWinner(null);

    lastEventCheckRef.current = 0;
    raceStartRef.current = performance.now();
    raceStateRef.current = 'racing';
    setRaceState('racing');
  };

  useEffect(() => {
    if (raceState !== 'racing') return;

    let lastFrameSeconds = 0;

    const step = () => {
      const elapsedSeconds = (performance.now() - raceStartRef.current) / 1000;
      const dt = elapsedSeconds - lastFrameSeconds;
      lastFrameSeconds = elapsedSeconds;

      playerProgressRef.current = Math.min(
        100,
        playerProgressRef.current + getFillPerSecond(stats.topSpeed) * dt,
      );
      rivalProgressRef.current = Math.min(
        100,
        rivalProgressRef.current + getFillPerSecond(rivalStatsRef.current.topSpeed) * dt,
      );

      // Both cars independently roll for a random event on the same fixed cadence — a boost
      // ("CRIT!") always lands, a slowdown attempt only costs progress (and shows "DRIFT!")
      // if the car's Handling-based resist roll fails; a resisted attempt is silent.
      if (elapsedSeconds - lastEventCheckRef.current >= AUTO_DRAG.EVENT_CHECK_INTERVAL_SECONDS) {
        lastEventCheckRef.current = elapsedSeconds;

        if (Math.random() < AUTO_DRAG.EVENT_CHANCE) {
          if (Math.random() < AUTO_DRAG.SLOWDOWN_SHARE) {
            if (Math.random() >= getResistChance(stats.handling)) {
              playerProgressRef.current = Math.max(
                0,
                playerProgressRef.current - AUTO_DRAG.SLOWDOWN_AMOUNT,
              );
              pushPlayerFloat('DRIFT!');
            }
          } else {
            playerProgressRef.current = Math.min(
              100,
              playerProgressRef.current + AUTO_DRAG.BOOST_AMOUNT,
            );
            pushPlayerFloat('CRIT!');
          }
        }

        if (Math.random() < AUTO_DRAG.EVENT_CHANCE) {
          if (Math.random() < AUTO_DRAG.SLOWDOWN_SHARE) {
            if (Math.random() >= getResistChance(rivalStatsRef.current.handling)) {
              rivalProgressRef.current = Math.max(
                0,
                rivalProgressRef.current - AUTO_DRAG.SLOWDOWN_AMOUNT,
              );
              pushRivalFloat('DRIFT!');
            }
          } else {
            rivalProgressRef.current = Math.min(
              100,
              rivalProgressRef.current + AUTO_DRAG.BOOST_AMOUNT,
            );
            pushRivalFloat('CRIT!');
          }
        }
      }

      setPlayerProgress(playerProgressRef.current);
      setRivalProgress(rivalProgressRef.current);

      if (raceStateRef.current === 'racing') {
        if (playerProgressRef.current >= 100) {
          raceStateRef.current = 'finished';
          setWinner('player');
          setRaceState('finished');
          addNeon(netPayout, 'Auto-Drag — Win');
          return;
        }
        if (rivalProgressRef.current >= 100) {
          raceStateRef.current = 'finished';
          setWinner('rival');
          setRaceState('finished');
          return;
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceState]);

  const raceAgain = () => setRaceState('betting');

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
        <p className="font-display text-sm font-bold uppercase tracking-wide text-neon-magenta">
          Auto-Drag
        </p>
        <span className="text-xs font-medium tabular-nums text-neon-magenta">{neon} NEON</span>
      </div>

      {raceState === 'betting' && (
        <div className="rounded-xl border border-neon-magenta/30 bg-white/5 p-4 backdrop-blur-xl">
          <p className="text-center text-xs uppercase tracking-widest text-neutral-400">
            Place Your Bet
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {AUTO_DRAG.BET_TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setBetAmount(tier)}
                className={`rounded-lg border py-3 font-display text-sm font-bold tabular-nums transition-colors ${
                  betAmount === tier
                    ? 'border-neon-magenta bg-neon-magenta/15 text-neon-magenta shadow-[0_0_16px_rgba(255,46,230,0.35)]'
                    : 'border-neutral-700 bg-black/20 text-neutral-400'
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
            <span>Win Payout</span>
            <span className="text-right tabular-nums text-neon-cyan">
              +{netPayout} NEON{' '}
              <span className="text-neutral-600">
                (gross {grossPayout} − {AUTO_DRAG.SYSTEM_TAX_RATE * 100}% tax)
              </span>
            </span>
          </div>

          <motion.button
            type="button"
            onClick={startRace}
            disabled={!canAffordBet}
            whileHover={canAffordBet ? { scale: 1.05 } : undefined}
            whileTap={canAffordBet ? { scale: 0.95 } : undefined}
            className="mt-4 w-full rounded-lg border border-neon-magenta/50 bg-neon-magenta/10 py-3 font-display text-sm font-bold uppercase tracking-wide text-neon-magenta transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600"
          >
            Start Race
          </motion.button>
          {!canAffordBet && (
            <p className="mt-2 text-center text-xs text-red-400">Not enough NEON</p>
          )}
        </div>
      )}

      {raceState === 'racing' && (
        <div className="rounded-xl border border-neon-cyan/20 bg-white/5 p-4 backdrop-blur-xl">
          <div className="relative">
            <RaceProgressBar label="You" value={playerProgress} colorClass="bg-neon-cyan" instant />
            <FloatingEvents events={playerFloats} />
          </div>
          <div className="relative mt-4">
            <RaceProgressBar
              label="Rival"
              value={rivalProgress}
              colorClass="bg-neon-magenta"
              instant
            />
            <FloatingEvents events={rivalFloats} />
          </div>
          <p className="mt-4 text-center text-xs uppercase tracking-widest text-neutral-600">
            {betAmount} NEON on the line — hands off the wheel
          </p>
        </div>
      )}

      {raceState === 'finished' && (
        <div className="rounded-xl border border-neon-magenta/30 bg-white/5 p-4 text-center backdrop-blur-xl">
          {winner === 'player' ? (
            <>
              <p className="font-display text-lg font-bold uppercase tracking-wide text-neon-cyan">
                You Win
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                Gross {grossPayout} NEON − {tax} NEON tax
              </p>
              <p className="mt-1 font-display text-2xl font-bold text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]">
                +{netPayout} NEON
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-bold uppercase tracking-wide text-red-400">
                Rival Wins
              </p>
              <p className="mt-1 text-sm text-neutral-400">{betAmount} NEON lost to the Street</p>
            </>
          )}
          <motion.button
            type="button"
            onClick={raceAgain}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mt-4 w-full rounded-lg border border-neutral-700 py-2.5 text-sm font-medium text-neutral-300"
          >
            Race Again
          </motion.button>
        </div>
      )}
    </div>
  );
}

/** Floating "CRIT!"/"DRIFT!" callouts over a progress bar — absolutely positioned within
 * whichever `relative` wrapper it's rendered in, staggered sideways by index so two events
 * landing close together don't overlap illegibly. */
function FloatingEvents({ events }: { events: FloatEvent[] }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {events.map((event, index) => (
          <motion.span
            key={event.id}
            initial={{ opacity: 0, y: 8, scale: 0.85 }}
            animate={{ opacity: 1, y: -26, scale: 1 }}
            exit={{ opacity: 0, y: -36 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`absolute top-1 font-display text-sm font-extrabold uppercase tracking-wide drop-shadow-[0_0_8px_currentColor] ${
              event.text === 'CRIT!' ? 'text-neon-cyan' : 'text-amber'
            }`}
            style={{ left: `${24 + index * 18}%` }}
          >
            {event.text}
          </motion.span>
        ))}
      </AnimatePresence>
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
