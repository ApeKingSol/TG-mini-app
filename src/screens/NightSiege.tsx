import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Swords, Timer, Trophy, Truck } from 'lucide-react';
import { NIGHT_SIEGE } from '../game/config/economy';
import { useGameStore } from '../game/store/GameStore';
import {
  claimBossReward,
  fetchConvoyStatus,
  spawnNextRaid,
  submitDamage,
  type ConvoyStatus,
} from '../game/mock/siegeApi';

type SiegeState = 'idle' | 'combat' | 'results';

interface FloatingDamage {
  id: string;
  x: number;
  y: number;
  damage: number;
}

/** One tap's impact spark — a random rotation so a burst of several in a row never look like
 * identical stamped copies of each other. */
interface Spark {
  id: string;
  x: number;
  y: number;
  rotation: number;
}

/** The heavy-shake's pivot, as a percentage within the boss image's own bounding box — placed on
 * the opposite side from wherever the player just tapped (see handleBossHit) so the tapped zone
 * itself is the part furthest from the pivot and therefore the part that visibly swings the most,
 * instead of every tap kicking the same fixed part of the truck regardless of where it landed. */
interface HitOrigin {
  x: number;
  y: number;
}

/** How long a floating damage number stays in the DOM — must match .animate-float-up's own
 * duration in index.css, or the element either vanishes mid-animation or lingers invisible
 * after the CSS animation's `forwards` hold ends. */
const FLOAT_DURATION_MS = 800;
/** Same idea as FLOAT_DURATION_MS, matched to .animate-spark-explode's own duration. */
const SPARK_DURATION_MS = 250;
/** The HP bar is drawn as this many discrete blocks rather than one smooth fill — a chunkier,
 * more "raid boss health bar" read than a plain gradient bar. */
const HP_SEGMENT_COUNT = 20;
/** How often the shared Convoy HP re-polls while sitting on the idle screen — so another
 * Syndicate member's submitted damage (or a kill/claim/next-raid someone else triggered) shows
 * up without needing to leave and re-enter the tab. Not polled during combat/results — this
 * session's own damage is what's being staged there, not something a background refetch should
 * clobber mid-flight. */
const IDLE_POLL_INTERVAL_MS = 5000;

interface NightSiegeProps {
  /** Which Syndicate's shared Convoy to raid — the whole HP pool, damage submissions, and kill
   * claims are scoped to this id (see netlify/functions/night-siege.mts, keyed by syndicateId).
   * Always the current player's own Syndicate; SyndicateHub.tsx only ever mounts this once
   * `mySyndicate` is known. */
  syndicateId: string;
}

/** A Syndicate-only World Boss raid: no entry fee, no top-level "Hub" exit — this lives
 * permanently inside SyndicateHub once the player has a Syndicate, and the tab toggle above it
 * is the only way to leave. Every visit gets a free 30-second tap-damage window against the
 * Corporate Convoy; damage is submitted to a real, Syndicate-shared backend (see
 * src/game/mock/siegeApi.ts), and once the shared HP actually reaches 0 every current member can
 * claim a flat NIGHT_SIEGE.REWARD_NEON, exactly once each, for that kill. */
export function NightSiege({ syndicateId }: NightSiegeProps) {
  const lastClaimedBossId = useGameStore((state) => state.lastClaimedBossId);
  const creditBossKillReward = useGameStore((state) => state.creditBossKillReward);

  const [siegeState, setSiegeState] = useState<SiegeState>('idle');
  const [convoyStatus, setConvoyStatus] = useState<ConvoyStatus | null>(null);
  const [bossImageFailed, setBossImageFailed] = useState(false);

  const [timeLeft, setTimeLeft] = useState<number>(NIGHT_SIEGE.COMBAT_DURATION_SECONDS);
  const [sessionDamage, setSessionDamage] = useState(0);
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingDamage[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [hitOrigin, setHitOrigin] = useState<HitOrigin>({ x: 50, y: 50 });
  const [reportDamage, setReportDamage] = useState(0);

  const [isClaiming, setIsClaiming] = useState(false);
  const [isSpawningNext, setIsSpawningNext] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Points at the boss's own shake wrapper (not the much larger tap-catching area around it) so
  // handleBossHit can measure the tap against the truck's actual rendered bounding box.
  const bossWrapperRef = useRef<HTMLDivElement>(null);

  // Refs mirror sessionDamage/whether combat has already ended so the countdown effect and the
  // end-of-combat handler always read the true latest values, not a value captured one render
  // ago by a stale closure — the same lesson as Auto-Drag's rAF loop.
  const sessionDamageRef = useRef(0);
  const combatEndedRef = useRef(false);

  useEffect(() => {
    fetchConvoyStatus(syndicateId)
      .then(setConvoyStatus)
      .catch(() => {});
  }, [syndicateId]);

  // Keeps the shared HP bar honest while sitting idle — another member's submitted damage, a
  // kill, or someone else starting the next raid should all show up on their own, without
  // needing to leave and re-enter the tab.
  useEffect(() => {
    if (siegeState !== 'idle') return;
    const intervalId = window.setInterval(() => {
      fetchConvoyStatus(syndicateId)
        .then(setConvoyStatus)
        .catch(() => {});
    }, IDLE_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [siegeState, syndicateId]);

  // Combat countdown — re-arms itself every second while in combat.
  useEffect(() => {
    if (siegeState !== 'combat' || timeLeft <= 0) return;
    const timeoutId = window.setTimeout(() => setTimeLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timeoutId);
  }, [siegeState, timeLeft]);

  // Fires exactly once, the moment the countdown reaches 0 mid-combat.
  useEffect(() => {
    if (siegeState === 'combat' && timeLeft === 0 && !combatEndedRef.current) {
      combatEndedRef.current = true;
      void endCombat();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siegeState, timeLeft]);

  const handleEngage = () => {
    combatEndedRef.current = false;
    sessionDamageRef.current = 0;
    setSessionDamage(0);
    setFloatingNumbers([]);
    setSparks([]);
    setHitCount(0);
    setHitOrigin({ x: 50, y: 50 });
    setTimeLeft(NIGHT_SIEGE.COMBAT_DURATION_SECONDS);
    setSiegeState('combat');
  };

  const handleBossHit = (event: MouseEvent<HTMLDivElement>) => {
    if (siegeState !== 'combat') return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const damage = Math.round(
      NIGHT_SIEGE.DAMAGE_PER_TAP_MIN +
        Math.random() * (NIGHT_SIEGE.DAMAGE_PER_TAP_MAX - NIGHT_SIEGE.DAMAGE_PER_TAP_MIN),
    );

    sessionDamageRef.current += damage;
    setSessionDamage(sessionDamageRef.current);
    setHitCount((count) => count + 1);

    const wrapperRect = bossWrapperRef.current?.getBoundingClientRect();
    if (wrapperRect && wrapperRect.width > 0 && wrapperRect.height > 0) {
      const relX = Math.min(1, Math.max(0, (event.clientX - wrapperRect.left) / wrapperRect.width));
      const relY = Math.min(1, Math.max(0, (event.clientY - wrapperRect.top) / wrapperRect.height));
      setHitOrigin({ x: (1 - relX) * 100, y: (1 - relY) * 100 });
    }

    const damageId = crypto.randomUUID();
    setFloatingNumbers((prev) => [...prev, { id: damageId, x, y, damage }]);
    window.setTimeout(() => {
      setFloatingNumbers((prev) => prev.filter((entry) => entry.id !== damageId));
    }, FLOAT_DURATION_MS);

    const sparkId = crypto.randomUUID();
    const rotation = Math.round(Math.random() * 360);
    setSparks((prev) => [...prev, { id: sparkId, x, y, rotation }]);
    window.setTimeout(() => {
      setSparks((prev) => prev.filter((entry) => entry.id !== sparkId));
    }, SPARK_DURATION_MS);
  };

  const endCombat = async () => {
    const finalDamage = sessionDamageRef.current;
    try {
      const updated = await submitDamage(syndicateId, finalDamage);
      setConvoyStatus(updated);
    } catch {
      // Best-effort — the shared HP bar catches up on the next idle poll even if this
      // particular submit failed to reach the server (e.g. a dropped connection).
    }
    setReportDamage(finalDamage);
    setSiegeState('results');
  };

  const handleReturn = () => {
    setSiegeState('idle');
    setSessionDamage(0);
    sessionDamageRef.current = 0;
    setFloatingNumbers([]);
    setSparks([]);
    setHitCount(0);
    setHitOrigin({ x: 50, y: 50 });
    setClaimError(null);
  };

  const handleClaim = async () => {
    if (!convoyStatus || isClaiming) return;
    setClaimError(null);
    setIsClaiming(true);
    try {
      const result = await claimBossReward(syndicateId);
      creditBossKillReward(result.bossId);
      setConvoyStatus((prev) => (prev ? { ...prev, alreadyClaimed: true } : prev));
    } catch (err) {
      setClaimError(err instanceof Error ? err.message.toUpperCase() : 'CLAIM FAILED');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleSpawnNext = async () => {
    if (isSpawningNext) return;
    setIsSpawningNext(true);
    setClaimError(null);
    try {
      const fresh = await spawnNextRaid(syndicateId);
      setConvoyStatus(fresh);
    } catch {
      // Best-effort — the next idle poll/remount catches up regardless.
    } finally {
      setIsSpawningNext(false);
    }
  };

  const hpPercent = convoyStatus
    ? Math.max(0, Math.min(100, (convoyStatus.currentHp / convoyStatus.maxHp) * 100))
    : 0;
  const isBossDefeated = convoyStatus !== null && convoyStatus.currentHp <= 0;
  const alreadyClaimed =
    convoyStatus !== null &&
    (convoyStatus.alreadyClaimed || lastClaimedBossId === convoyStatus.bossId);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-display text-sm font-bold uppercase tracking-widest text-danger-red">
        Night Siege
      </p>

      <ConvoyHpBar hpPercent={hpPercent} convoyStatus={convoyStatus} />

      {siegeState === 'idle' && isBossDefeated && (
        <BossDefeatedPanel
          alreadyClaimed={alreadyClaimed}
          isClaiming={isClaiming}
          isSpawningNext={isSpawningNext}
          claimError={claimError}
          onClaim={handleClaim}
          onSpawnNext={handleSpawnNext}
        />
      )}

      {siegeState === 'idle' && !isBossDefeated && (
        <IdleScreen
          bossImageFailed={bossImageFailed}
          onBossImageError={() => setBossImageFailed(true)}
          onEngage={handleEngage}
        />
      )}

      {siegeState === 'combat' && (
        <CombatScreen
          timeLeft={timeLeft}
          sessionDamage={sessionDamage}
          floatingNumbers={floatingNumbers}
          sparks={sparks}
          hitCount={hitCount}
          hitOrigin={hitOrigin}
          bossWrapperRef={bossWrapperRef}
          onBossHit={handleBossHit}
          bossImageFailed={bossImageFailed}
          onBossImageError={() => setBossImageFailed(true)}
        />
      )}

      {siegeState === 'results' && (
        <ResultsScreen
          damage={reportDamage}
          onReturn={handleReturn}
          isBossDefeated={isBossDefeated}
          alreadyClaimed={alreadyClaimed}
          isClaiming={isClaiming}
          isSpawningNext={isSpawningNext}
          claimError={claimError}
          onClaim={handleClaim}
          onSpawnNext={handleSpawnNext}
        />
      )}
    </div>
  );
}

interface ConvoyHpBarProps {
  hpPercent: number;
  convoyStatus: ConvoyStatus | null;
}

/** The Convoy's shared HP — a raid-wide total every Syndicate member's damage chips away at,
 * not anything this session alone moves. Drawn as discrete segments rather than one smooth
 * bar for a chunkier "boss health bar" read. */
function ConvoyHpBar({ hpPercent, convoyStatus }: ConvoyHpBarProps) {
  const filledSegments = Math.round((hpPercent / 100) * HP_SEGMENT_COUNT);

  return (
    <div className="rounded-2xl border border-danger-red/30 bg-black/40 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-neutral-500">
        <span className="flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-danger-red" strokeWidth={2} />
          Corporate Convoy — World Boss
        </span>
        <span className="font-bold text-danger-red">{Math.round(hpPercent)}%</span>
      </div>

      <div className="mt-2 flex gap-[3px]">
        {Array.from({ length: HP_SEGMENT_COUNT }).map((_, index) => (
          <div
            key={index}
            className={`h-4 flex-1 rounded-[2px] transition-colors duration-300 ${
              index < filledSegments
                ? 'bg-danger-red shadow-[0_0_8px_rgba(255,0,60,0.65)]'
                : 'bg-neutral-800'
            }`}
          />
        ))}
      </div>

      <p className="mt-2 text-center text-[10px] tabular-nums text-neutral-600">
        {convoyStatus
          ? `${convoyStatus.currentHp.toLocaleString()} / ${convoyStatus.maxHp.toLocaleString()} HP`
          : 'Establishing uplink...'}
      </p>
    </div>
  );
}

interface BossDefeatedPanelProps {
  alreadyClaimed: boolean;
  isClaiming: boolean;
  isSpawningNext: boolean;
  claimError: string | null;
  onClaim: () => void;
  onSpawnNext: () => void;
}

/** Shown whenever the shared Convoy HP has actually reached 0 — either landed on directly (the
 * idle screen, for a member who wasn't the one to land the final blow) or right after this
 * session's own combat window ended the fight (see ResultsScreen). Every current member can
 * claim NIGHT_SIEGE.REWARD_NEON exactly once for this kill (server-enforced — see
 * night-siege.mts's handleClaim); "Start Next Raid" is a separate, explicit action so a member
 * who hasn't had the chance to claim yet can't have that window closed out from under them by
 * someone else moving on first. */
function BossDefeatedPanel({
  alreadyClaimed,
  isClaiming,
  isSpawningNext,
  claimError,
  onClaim,
  onSpawnNext,
}: BossDefeatedPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center gap-3 rounded-2xl border-2 border-toxic-green bg-toxic-green/10 p-5 text-center shadow-[0_0_32px_rgba(57,255,20,0.35)]"
    >
      <Trophy
        className="h-10 w-10 text-toxic-green drop-shadow-[0_0_16px_rgba(57,255,20,0.6)]"
        strokeWidth={1.5}
      />
      <p className="font-display text-lg font-black uppercase tracking-widest text-toxic-green drop-shadow-[0_0_16px_rgba(57,255,20,0.5)]">
        Convoy Defeated!
      </p>
      <p className="text-xs text-toxic-green/80">
        The Syndicate brought down the Corporate Convoy. Every member can claim the kill reward.
      </p>

      {claimError && (
        <p className="text-xs font-bold uppercase tracking-widest text-danger-red">{claimError}</p>
      )}

      <motion.button
        type="button"
        onClick={onClaim}
        disabled={alreadyClaimed || isClaiming}
        whileHover={!alreadyClaimed && !isClaiming ? { scale: 1.02 } : undefined}
        whileTap={!alreadyClaimed && !isClaiming ? { scale: 0.97 } : undefined}
        className={`w-full rounded-lg border-2 py-3 font-display text-sm font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
          alreadyClaimed
            ? 'border-toxic-green/40 bg-toxic-green/5 text-toxic-green/70'
            : 'border-toxic-green bg-toxic-green/15 text-toxic-green shadow-[0_0_16px_rgba(57,255,20,0.35)]'
        }`}
      >
        {alreadyClaimed
          ? 'Reward Claimed'
          : isClaiming
            ? 'Claiming...'
            : `Claim ${NIGHT_SIEGE.REWARD_NEON} NEON`}
      </motion.button>

      <button
        type="button"
        onClick={onSpawnNext}
        disabled={isSpawningNext}
        className="text-[10px] uppercase tracking-widest text-neutral-500 underline decoration-dotted underline-offset-2 disabled:opacity-50"
      >
        {isSpawningNext ? 'Starting...' : 'Start Next Raid'}
      </button>
    </motion.div>
  );
}

interface BossPortraitProps {
  failed: boolean;
  onError: () => void;
  className: string;
}

/** The Corporate Convoy's portrait — a real cutout (transparent background baked into the
 * `.webp` itself, not a mix-blend trick), so the armor plating renders fully solid and opaque
 * against the dark UI instead of washing out. Falls back to a plain Truck icon if
 * /boss-convoy.webp hasn't been supplied yet, so the raid never shows a broken-image icon in
 * the meantime. */
function BossPortrait({ failed, onError, className }: BossPortraitProps) {
  if (failed) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <Truck className="h-24 w-24 text-danger-red/70" strokeWidth={1.1} />
      </div>
    );
  }

  return (
    <img
      src="/boss-convoy.webp"
      alt="Corporate Convoy"
      onError={onError}
      className={`object-contain ${className}`}
    />
  );
}

interface IdleScreenProps {
  bossImageFailed: boolean;
  onBossImageError: () => void;
  onEngage: () => void;
}

/** The briefing — just the boss and the button in. No fee, no leaderboard, no fine print: the
 * only decision here is whether to spend your one free assault window right now. */
function IdleScreen({ bossImageFailed, onBossImageError, onEngage }: IdleScreenProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-amber/30 bg-black/40 p-6">
        <BossPortrait
          failed={bossImageFailed}
          onError={onBossImageError}
          className="mx-auto h-48 w-auto drop-shadow-[0_0_30px_rgba(255,0,60,0.35)]"
        />
      </div>

      <p className="text-center text-xs text-neutral-400">
        Every Syndicate member gets one free 30-second assault window per raid. Land as many
        hits as you can before the Convoy breaks contact.
      </p>

      <motion.button
        type="button"
        onClick={onEngage}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="rounded-xl border-2 border-danger-red bg-danger-red/15 py-4 font-display text-base font-black uppercase tracking-widest text-danger-red shadow-[0_0_28px_rgba(255,0,60,0.35)]"
      >
        Engage Convoy
      </motion.button>
    </div>
  );
}

interface CombatScreenProps {
  timeLeft: number;
  sessionDamage: number;
  floatingNumbers: FloatingDamage[];
  sparks: Spark[];
  hitCount: number;
  hitOrigin: HitOrigin;
  bossWrapperRef: RefObject<HTMLDivElement | null>;
  onBossHit: (event: MouseEvent<HTMLDivElement>) => void;
  bossImageFailed: boolean;
  onBossImageError: () => void;
}

/** The active raid window: a countdown, the player's own running damage total, and the boss
 * itself as the tap target, staged on top of a furiously scrolling action backdrop. Every tap
 * spawns a floating damage number (.animate-float-up), a bright impact spark
 * (.animate-spark-explode), and a red hit-glow behind the boss (.animate-hit-glow) at/around the
 * tap point, and restarts the boss's hit-shake — all four keyed off the same `hitCount` remount,
 * so a rapid-fire tap cleanly restarts every one of them instead of the second tap landing
 * mid-animation and being ignored. Layering back to front: the scrolling background, a static
 * dark overlay (keeps the boss readable against the chaos rather than any mix-blend trick — the
 * boss art itself is already a clean cutout, see BossPortrait), the boss + its hit-glow, then
 * the click particles on top of everything. */
function CombatScreen({
  timeLeft,
  sessionDamage,
  floatingNumbers,
  sparks,
  hitCount,
  hitOrigin,
  bossWrapperRef,
  onBossHit,
  bossImageFailed,
  onBossImageError,
}: CombatScreenProps) {
  const isUrgent = timeLeft <= 5;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-danger-red/30 bg-black/50 p-3">
        <div className="flex items-center gap-1.5 text-neutral-500">
          <Timer className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="text-[10px] uppercase tracking-widest">Time Left</span>
        </div>
        <span
          className={`font-display text-2xl font-black tabular-nums ${
            isUrgent ? 'animate-pulse text-danger-red' : 'text-neutral-100'
          }`}
        >
          00:{timeLeft.toString().padStart(2, '0')}
        </span>
      </div>

      <div className="rounded-xl border border-amber/40 bg-black/40 p-3 text-center">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Damage Dealt</p>
        <p className="font-display text-3xl font-black tabular-nums text-amber drop-shadow-[0_0_12px_rgba(255,149,0,0.55)]">
          {sessionDamage.toLocaleString()}
        </p>
      </div>

      <div
        onClick={onBossHit}
        className="relative flex min-h-[42vh] cursor-pointer select-none items-center justify-center overflow-hidden rounded-2xl border-2 border-danger-red/50"
      >
        {/* Layer 1 — the furious scrolling action background (Mirrored Seamless Track, same
         * fix as Smuggler's Run's tunnel — see index.css's .siege-scroll-track comment). */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="siege-scroll-track flex h-full w-[200%]">
            <div className="h-full w-1/2 bg-[url('/background_syndicat.jpg')] bg-bottom bg-no-repeat bg-[length:auto_100%]" />
            <div className="h-full w-1/2 -scale-x-100 bg-[url('/background_syndicat.jpg')] bg-bottom bg-no-repeat bg-[length:auto_100%]" />
          </div>
        </div>

        {/* Static dark overlay — keeps the boss and the UI text readable against the scrolling
         * chaos behind it. Explicit no z-index: sits above the background above purely by DOM
         * order, below the z-10 boss layer below purely by z-index. */}
        <div className="absolute inset-0 bg-black/70" />

        {/* Layer 2 — the boss truck + its on-hit red glow (no ambient/looping effects here —
         * this only ever fires in direct response to a tap). */}
        <div className="relative z-10 flex h-full w-full items-center justify-center">
          <div
            key={hitCount}
            ref={bossWrapperRef}
            className={`relative ${hitCount > 0 ? 'animate-heavy-shake' : ''}`}
            style={{ transformOrigin: `${hitOrigin.x}% ${hitOrigin.y}%` }}
          >
            <div
              className={`pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(255,0,60,0.7),transparent_70%)] opacity-0 ${
                hitCount > 0 ? 'animate-hit-glow' : ''
              }`}
            />
            <BossPortrait
              failed={bossImageFailed}
              onError={onBossImageError}
              className="h-56 w-auto drop-shadow-[0_0_40px_rgba(255,0,60,0.55)]"
            />
          </div>
        </div>

        {/* Layer 3 — click particles: floating damage numbers + impact sparks, always on top. */}
        {floatingNumbers.map((entry) => (
          <span
            key={entry.id}
            className="animate-float-up pointer-events-none absolute z-20 font-display text-2xl font-black text-danger-red drop-shadow-[0_0_10px_rgba(255,0,60,0.85)]"
            style={{ left: `${entry.x}px`, top: `${entry.y}px` }}
          >
            -{entry.damage}
          </span>
        ))}
        {sparks.map((spark) => (
          <div
            key={spark.id}
            className="animate-spark-explode pointer-events-none absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-amber"
            style={
              {
                left: `${spark.x}px`,
                top: `${spark.y}px`,
                '--spark-rotation': `${spark.rotation}deg`,
              } as CSSProperties
            }
          />
        ))}

        <p className="pointer-events-none absolute bottom-4 z-20 text-[10px] uppercase tracking-widest text-neutral-400">
          Tap the Convoy — Deal Damage
        </p>
      </div>
    </div>
  );
}

interface ResultsScreenProps {
  damage: number;
  onReturn: () => void;
  isBossDefeated: boolean;
  alreadyClaimed: boolean;
  isClaiming: boolean;
  isSpawningNext: boolean;
  claimError: string | null;
  onClaim: () => void;
  onSpawnNext: () => void;
}

/** The results screen — a snapshot of exactly what was submitted at the moment combat ended, so
 * this never has to re-derive numbers from state that keeps changing after the fact. If this
 * session's own damage happened to bring the shared HP to 0, the BossDefeatedPanel renders right
 * here too, so the player who landed the final blow doesn't have to tap "Return" first just to
 * see the claim button. "Return" resets straight back to idle (not out to some parent hub) —
 * Night Siege has nowhere else to go, since the Syndicates tab toggle is the only navigation
 * above it. */
function ResultsScreen({
  damage,
  onReturn,
  isBossDefeated,
  alreadyClaimed,
  isClaiming,
  isSpawningNext,
  claimError,
  onClaim,
  onSpawnNext,
}: ResultsScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-danger-red/40 bg-black/60 p-6 text-center backdrop-blur-xl"
    >
      <Swords
        className="h-14 w-14 text-danger-red drop-shadow-[0_0_20px_rgba(255,0,60,0.7)]"
        strokeWidth={1.5}
      />

      <p className="font-display text-2xl font-black uppercase tracking-widest text-danger-red drop-shadow-[0_0_20px_rgba(255,0,60,0.6)]">
        Siege Complete
      </p>

      <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Damage Dealt</p>
        <p className="font-display text-4xl font-black tabular-nums text-amber drop-shadow-[0_0_16px_rgba(255,149,0,0.55)]">
          {damage.toLocaleString()}
        </p>
      </div>

      {isBossDefeated && (
        <div className="w-full">
          <BossDefeatedPanel
            alreadyClaimed={alreadyClaimed}
            isClaiming={isClaiming}
            isSpawningNext={isSpawningNext}
            claimError={claimError}
            onClaim={onClaim}
            onSpawnNext={onSpawnNext}
          />
        </div>
      )}

      <motion.button
        type="button"
        onClick={onReturn}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className="w-full rounded-lg border border-neutral-700 bg-white/10 py-3 font-display text-sm font-bold uppercase tracking-wide text-neutral-100"
      >
        Return
      </motion.button>
    </motion.div>
  );
}
