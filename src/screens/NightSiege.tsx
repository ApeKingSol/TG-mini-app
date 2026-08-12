import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from 'react';
import { motion } from 'framer-motion';
import { Hourglass, Loader2, ShieldAlert, ShieldOff, Swords, Trophy, Truck } from 'lucide-react';
import {
  NIGHT_SIEGE,
  getNightSiegeTapDamage,
  getNightSiegeReward,
  isBossAttackAvailable,
  type SyndicateRole,
} from '../game/config/economy';
import { useGameStore } from '../game/store/GameStore';
import {
  claimBossReward,
  fetchNightSiegeStatus,
  startRaid,
  submitDamage,
  type ConvoyStatus,
  type NightSiegeStatus,
} from '../game/mock/siegeApi';

/** How long a floating damage number stays in the DOM — must match .animate-float-up's own
 * duration in index.css, or the element either vanishes mid-animation or lingers invisible
 * after the CSS animation's `forwards` hold ends. */
const FLOAT_DURATION_MS = 800;
/** Same idea as FLOAT_DURATION_MS, matched to .animate-spark-explode's own duration. */
const SPARK_DURATION_MS = 250;
/** The HP bar is drawn as this many discrete blocks rather than one smooth fill — a chunkier,
 * more "raid boss health bar" read than a plain gradient bar. */
const HP_SEGMENT_COUNT = 20;
/** How often the shared Convoy status re-polls while idle — so another Syndicate member's
 * submitted session (or a Leader/Co-Leader starting/kill/expiry) shows up without needing to
 * leave and re-enter the tab. Paused entirely while a local tapping session is in progress —
 * see the poll effect below. */
const IDLE_POLL_INTERVAL_MS = 5000;

type TapPhase = 'idle' | 'tapping' | 'submitting';

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
 * the opposite side from wherever the player just tapped (see handleBossTap) so the tapped zone
 * itself is the part furthest from the pivot and therefore the part that visibly swings the most,
 * instead of every tap kicking the same fixed part of the truck regardless of where it landed. */
interface HitOrigin {
  x: number;
  y: number;
}

interface NightSiegeProps {
  /** Which Syndicate's shared Convoy to raid — the whole HP pool, raid start, damage
   * submissions, and kill claims are scoped to this id (see netlify/functions/night-siege.mts,
   * keyed by syndicateId). Always the current player's own Syndicate; SyndicateHub.tsx only
   * ever mounts this once `mySyndicate` is known. */
  syndicateId: string;
  /** The current player's standing in that Syndicate — SyndicateHub.tsx already computes this
   * for its own roster, so it's passed down rather than re-derived here. Drives both the
   * start-raid gate (only 'leader'/'co-leader' can spawn a fresh Convoy) and which reward tier
   * the claim preview shows. */
  myRole: SyndicateRole;
  /** Fired every time a fresh status is fetched (initial load or idle poll) with whatever the
   * current boss's damageLog is (`{}` if no raid is active) — lets SyndicateHub.tsx's roster
   * show each member's damage without running its own second, redundant poller against the
   * same endpoint. */
  onDamageLogUpdate?: (damageLog: Record<string, number>) => void;
}

/** Zero-pads and formats a countdown as HH:MM:SS — both the 8h attack cooldown and the 72h boss
 * lifetime can run well past a minute, so unlike the 15s tap timer this always needs the hours
 * place. Mirrors RaceScreen.tsx's formatSyphonCountdown; kept as its own local copy rather than
 * a shared util, matching this codebase's existing per-screen convention for small formatters.
 *
 * Clamps a non-finite `ms` (NaN/Infinity — e.g. from a legacy boss record missing
 * `bossExpiresAt`, or any other bad input that slipped past the call site's own guards) down to
 * 0 rather than letting it propagate into "NaN:NaN:NaN" on screen — a last-resort safety net on
 * top of the checks callers already do. */
function formatCountdown(ms: number): string {
  const safeMs = Number.isFinite(ms) ? ms : 0;
  const totalSeconds = Math.max(0, Math.ceil(safeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

/** A Syndicate-only World Boss raid: no entry fee, no top-level "Hub" exit — this lives
 * permanently inside SyndicateHub once the player has a Syndicate, and the tab toggle above it
 * is the only way to leave. A raid doesn't exist at all until the Leader or a Co-Leader
 * explicitly starts one; once it's up, any member gets one 15-second tapping session every
 * NIGHT_SIEGE.ATTACK_COOLDOWN_MS — every tap deals getNightSiegeTapDamage(carTier), and the
 * *total* accumulated across the session is submitted to the server in a single batched request
 * once the timer runs out, rather than one request per tap. Once the shared HP reaches 0, every
 * current member can claim their role-tiered $NEON reward exactly once for that kill. */
export function NightSiege({ syndicateId, myRole, onDamageLogUpdate }: NightSiegeProps) {
  const storeSyndicateId = useGameStore((state) => state.syndicateId);
  const activeSyndicateId = syndicateId;
  const carTier = useGameStore((state) => state.carTier);
  const lastBossAttackTime = useGameStore((state) => state.lastBossAttackTime);
  const recordBossAttack = useGameStore((state) => state.recordBossAttack);
  const lastClaimedBossId = useGameStore((state) => state.lastClaimedBossId);
  const creditBossKillReward = useGameStore((state) => state.creditBossKillReward);

  const [boss, setBoss] = useState<ConvoyStatus | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [nextAttackAvailableAt, setNextAttackAvailableAt] = useState<number | null>(null);
  const [bossImageFailed, setBossImageFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isStartingRaid, setIsStartingRaid] = useState(false);
  const [startRaidError, setStartRaidError] = useState<string | null>(null);

  const [tapPhase, setTapPhase] = useState<TapPhase>('idle');
  const [tapSecondsLeft, setTapSecondsLeft] = useState<number>(NIGHT_SIEGE.TAP_PHASE_SECONDS);
  const [sessionDamage, setSessionDamage] = useState(0);
  const [floatingNumbers, setFloatingNumbers] = useState<FloatingDamage[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [hitCount, setHitCount] = useState(0);
  const [hitOrigin, setHitOrigin] = useState<HitOrigin>({ x: 50, y: 50 });
  const [attackError, setAttackError] = useState<string | null>(null);

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Points at the boss's own shake wrapper (not the much larger tap-catching area around it) so
  // handleBossTap can measure the tap against the truck's actual rendered bounding box.
  const bossWrapperRef = useRef<HTMLDivElement>(null);

  // Refs mirror sessionDamage/whether the session has already ended so the countdown effect and
  // the end-of-session handler always read the true latest values, not a value captured one
  // render ago by a stale closure — the same lesson as Auto-Drag's rAF loop.
  const sessionDamageRef = useRef(0);
  const sessionEndedRef = useRef(false);

  // The countdown(s) need a live clock of its own — nothing else on this screen ticks every
  // second while sitting idle.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const applyStatus = (status: NightSiegeStatus) => {
    setLoadError(null);
    setHasLoadedOnce(true);
    setBoss(status.boss);
    setNextAttackAvailableAt(status.nextAttackAvailableAt);
    onDamageLogUpdate?.(status.boss?.damageLog ?? {});
  };

  const handleFetchError = (err: unknown) => {
    setHasLoadedOnce(true);
    setLoadError(err instanceof Error ? err.message.toUpperCase() : 'COULD NOT REACH NIGHT SIEGE');
  };

  useEffect(() => {
    fetchNightSiegeStatus(activeSyndicateId).then(applyStatus).catch(handleFetchError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSyndicateId]);

  // Keeps the shared status honest while sitting idle — another member's session, a Leader/
  // Co-Leader starting/restarting the raid, a kill, or an expiry should all show up on their
  // own, without needing to leave and re-enter the tab. Paused entirely during a local tapping
  // session: the running local sessionDamage counter is the source of truth until it's
  // submitted, and a poll landing mid-session would only overwrite `boss` with an HP figure the
  // player's own taps have already moved past locally, which is just visual noise until the
  // real submission lands anyway.
  useEffect(() => {
    if (tapPhase !== 'idle') return;
    const intervalId = window.setInterval(() => {
      fetchNightSiegeStatus(activeSyndicateId).then(applyStatus).catch(handleFetchError);
    }, IDLE_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSyndicateId, tapPhase]);

  const isBossDefeated = boss !== null && boss.currentHp <= 0;
  const alreadyClaimed =
    boss !== null && (boss.alreadyClaimed || lastClaimedBossId === boss.bossId);
  const canStartRaid = myRole !== 'member';

  // Prefers the server's own view of the cooldown (nextAttackAvailableAt, refreshed every poll)
  // over the purely local lastBossAttackTime mirror once we actually have one — the server is
  // what actually enforces this gate, so if the two ever disagree (this account attacked from a
  // different device, say), the server's answer is the one that matters. Only derived from the
  // local mirror — via isBossAttackAvailable's NaN/null-safe check, so a legacy or malformed
  // value here can never show "NaN:NaN:NaN" or lock the button forever — before the very first
  // successful fetch has told us anything at all.
  const effectiveNextAttackAt: number | null =
    nextAttackAvailableAt !== null
      ? nextAttackAvailableAt
      : isBossAttackAvailable(lastBossAttackTime, now)
        ? null
        : Number(lastBossAttackTime) + NIGHT_SIEGE.ATTACK_COOLDOWN_MS;
  const canAttackByCooldown = effectiveNextAttackAt === null || now >= effectiveNextAttackAt;
  const canAttack = canAttackByCooldown && boss !== null && !isBossDefeated;
  const msUntilNextAttack = canAttackByCooldown ? 0 : Math.max(0, effectiveNextAttackAt! - now);
  const tapDamagePerHit = getNightSiegeTapDamage(carTier);
  const projectedReward = getNightSiegeReward(myRole);

  const handleStartRaid = async () => {
    if (!canStartRaid || isStartingRaid) return;
    setStartRaidError(null);
    setIsStartingRaid(true);
    try {
      const status = await startRaid(activeSyndicateId);
      applyStatus(status);
    } catch (err) {
      setStartRaidError(err instanceof Error ? err.message.toUpperCase() : 'START FAILED');
    } finally {
      setIsStartingRaid(false);
    }
  };

  const handleBeginTapping = () => {
    if (!canAttack || tapPhase !== 'idle') return;
    sessionEndedRef.current = false;
    sessionDamageRef.current = 0;
    setSessionDamage(0);
    setFloatingNumbers([]);
    setSparks([]);
    setHitCount(0);
    setHitOrigin({ x: 50, y: 50 });
    setAttackError(null);
    setTapSecondsLeft(NIGHT_SIEGE.TAP_PHASE_SECONDS);
    setTapPhase('tapping');
  };

  const handleBossTap = (event: MouseEvent<HTMLDivElement>) => {
    if (tapPhase !== 'tapping') return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    sessionDamageRef.current += tapDamagePerHit;
    setSessionDamage(sessionDamageRef.current);
    setHitCount((count) => count + 1);

    const wrapperRect = bossWrapperRef.current?.getBoundingClientRect();
    if (wrapperRect && wrapperRect.width > 0 && wrapperRect.height > 0) {
      const relX = Math.min(1, Math.max(0, (event.clientX - wrapperRect.left) / wrapperRect.width));
      const relY = Math.min(1, Math.max(0, (event.clientY - wrapperRect.top) / wrapperRect.height));
      setHitOrigin({ x: (1 - relX) * 100, y: (1 - relY) * 100 });
    }

    const damageId = crypto.randomUUID();
    setFloatingNumbers((prev) => [...prev, { id: damageId, x, y, damage: tapDamagePerHit }]);
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

  // Countdown — re-arms itself every second while tapping.
  useEffect(() => {
    if (tapPhase !== 'tapping' || tapSecondsLeft <= 0) return;
    const timeoutId = window.setTimeout(() => setTapSecondsLeft((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timeoutId);
  }, [tapPhase, tapSecondsLeft]);

  // Fires exactly once, the moment the countdown reaches 0 mid-session.
  useEffect(() => {
    if (tapPhase === 'tapping' && tapSecondsLeft === 0 && !sessionEndedRef.current) {
      sessionEndedRef.current = true;
      void endTapSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tapPhase, tapSecondsLeft]);

  const endTapSession = async () => {
    setTapPhase('submitting');
    const finalDamage = sessionDamageRef.current;
    try {
      const status = await submitDamage(activeSyndicateId, finalDamage, carTier);
      applyStatus(status);
      recordBossAttack(Date.now());
    } catch (err) {
      setAttackError(err instanceof Error ? err.message.toUpperCase() : 'SUBMIT FAILED');
    } finally {
      setTapPhase('idle');
    }
  };

  const handleClaim = async () => {
    if (!boss || isClaiming) return;
    setClaimError(null);
    setIsClaiming(true);
    try {
      const result = await claimBossReward(activeSyndicateId);
      creditBossKillReward(result.bossId, result.rewardNeon);
      setBoss((prev) => (prev ? { ...prev, alreadyClaimed: true } : prev));
    } catch (err) {
      setClaimError(err instanceof Error ? err.message.toUpperCase() : 'CLAIM FAILED');
    } finally {
      setIsClaiming(false);
    }
  };

  const hpPercent = boss ? Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100)) : 0;
  // A legacy boss record predating bossExpiresAt would otherwise leave this NaN — night-siege.mts
  // now backfills a fresh expiry for exactly that case, but this stays defensive on the client
  // too rather than trusting the server response's shape unconditionally.
  const msUntilExpiry =
    boss && Number.isFinite(boss.bossExpiresAt) ? boss.bossExpiresAt - now : 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-display text-sm font-bold uppercase tracking-widest text-danger-red">
        Night Siege
      </p>

      {boss && <ConvoyHpBar hpPercent={hpPercent} boss={boss} msUntilExpiry={msUntilExpiry} />}

      {!hasLoadedOnce ? (
        <LoadingPanel />
      ) : boss === null ? (
        <NoActiveRaidPanel
          canStartRaid={canStartRaid}
          isStartingRaid={isStartingRaid}
          startRaidError={startRaidError}
          loadError={loadError}
          onStartRaid={handleStartRaid}
        />
      ) : isBossDefeated ? (
        <BossDefeatedPanel
          alreadyClaimed={alreadyClaimed}
          isClaiming={isClaiming}
          claimError={claimError}
          projectedReward={projectedReward}
          canStartRaid={canStartRaid}
          isStartingRaid={isStartingRaid}
          startRaidError={startRaidError}
          onClaim={handleClaim}
          onStartRaid={handleStartRaid}
        />
      ) : tapPhase !== 'idle' ? (
        <TappingScreen
          tapPhase={tapPhase}
          tapSecondsLeft={tapSecondsLeft}
          sessionDamage={sessionDamage}
          floatingNumbers={floatingNumbers}
          sparks={sparks}
          hitCount={hitCount}
          hitOrigin={hitOrigin}
          bossWrapperRef={bossWrapperRef}
          onBossTap={handleBossTap}
          bossImageFailed={bossImageFailed}
          onBossImageError={() => setBossImageFailed(true)}
        />
      ) : (
        <AttackIdlePanel
          canAttack={canAttack}
          msUntilNextAttack={msUntilNextAttack}
          tapDamagePerHit={tapDamagePerHit}
          carTier={carTier}
          attackError={attackError}
          bossImageFailed={bossImageFailed}
          onBossImageError={() => setBossImageFailed(true)}
          onBeginTapping={handleBeginTapping}
        />
      )}
    </div>
  );
}

interface ConvoyHpBarProps {
  hpPercent: number;
  boss: ConvoyStatus;
  msUntilExpiry: number;
}

/** The Convoy's shared HP — a raid-wide total every Syndicate member's damage chips away at,
 * not anything this session alone moves. Drawn as discrete segments rather than one smooth
 * bar for a chunkier "boss health bar" read. Shows a countdown to the boss's own 72h expiry
 * while it's still alive, so the Syndicate can see the raid is actually time-limited. */
function ConvoyHpBar({ hpPercent, boss, msUntilExpiry }: ConvoyHpBarProps) {
  const filledSegments = Math.round((hpPercent / 100) * HP_SEGMENT_COUNT);
  const isDefeated = boss.currentHp <= 0;

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
        {boss.currentHp.toLocaleString()} / {boss.maxHp.toLocaleString()} HP
      </p>

      {!isDefeated && (
        <p className="mt-1 flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-neutral-600">
          <Hourglass className="h-2.5 w-2.5" strokeWidth={2} />
          Convoy escapes in {formatCountdown(msUntilExpiry)}
        </p>
      )}
    </div>
  );
}

/** Shown for the brief window before the very first status fetch resolves — distinct from "no
 * active raid" (a real, confirmed answer) so the empty state never flashes before the real one
 * is known. */
function LoadingPanel() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-black/40 py-10">
      <Loader2 className="h-6 w-6 animate-spin text-danger-red" strokeWidth={2} />
      <p className="text-xs uppercase tracking-widest text-neutral-600">Scanning for hostiles...</p>
    </div>
  );
}

interface NoActiveRaidPanelProps {
  canStartRaid: boolean;
  isStartingRaid: boolean;
  startRaidError: string | null;
  loadError: string | null;
  onStartRaid: () => void;
}

/** No Convoy is currently up for this Syndicate — the Leader or a Co-Leader has to explicitly
 * start one (see night-siege.mts's handleStartRaid); a regular member just sees who they're
 * waiting on, with no action of their own available here. */
function NoActiveRaidPanel({
  canStartRaid,
  isStartingRaid,
  startRaidError,
  loadError,
  onStartRaid,
}: NoActiveRaidPanelProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-black/40 p-6 text-center">
      <ShieldOff className="h-10 w-10 text-neutral-600" strokeWidth={1.5} />
      <p className="font-display text-sm font-bold uppercase tracking-widest text-neutral-400">
        No Active Raid
      </p>

      {loadError && (
        <p className="text-xs font-bold uppercase tracking-widest text-danger-red">{loadError}</p>
      )}

      {canStartRaid ? (
        <>
          <p className="text-xs text-neutral-500">
            Rally the Syndicate — start a raid on the next Corporate Convoy.
          </p>
          {startRaidError && startRaidError !== loadError && (
            <p className="text-xs font-bold uppercase tracking-widest text-danger-red">
              {startRaidError}
            </p>
          )}
          <motion.button
            type="button"
            onClick={onStartRaid}
            disabled={isStartingRaid}
            whileHover={!isStartingRaid ? { scale: 1.02 } : undefined}
            whileTap={!isStartingRaid ? { scale: 0.97 } : undefined}
            className="mt-1 w-full rounded-xl border-2 border-danger-red bg-danger-red/15 py-3 font-display text-sm font-black uppercase tracking-widest text-danger-red shadow-[0_0_20px_rgba(255,0,60,0.3)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStartingRaid ? 'Starting...' : 'Start Raid'}
          </motion.button>
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Waiting for the Leader or a Co-Leader to start a raid.
        </p>
      )}
    </div>
  );
}

interface BossDefeatedPanelProps {
  alreadyClaimed: boolean;
  isClaiming: boolean;
  claimError: string | null;
  /** getNightSiegeReward(myRole) — the amount *this* claim will pay out. The actual credited
   * amount always comes from the claim response itself (see handleClaim), this is purely a
   * pre-claim preview so the button can say exactly what it's about to pay before it's pressed. */
  projectedReward: number;
  canStartRaid: boolean;
  isStartingRaid: boolean;
  startRaidError: string | null;
  onClaim: () => void;
  onStartRaid: () => void;
}

/** Shown whenever the shared Convoy HP has actually reached 0. Every current member can claim
 * their own role-tiered $NEON reward exactly once for this kill (server-enforced — see
 * night-siege.mts's handleClaim/getNightSiegeReward); starting the next raid is a separate,
 * explicit action gated the same way the very first one is (Leader/Co-Leader only), so a
 * regular member who helped land the kill can still see it here but can't trigger the next one
 * themselves. */
function BossDefeatedPanel({
  alreadyClaimed,
  isClaiming,
  claimError,
  projectedReward,
  canStartRaid,
  isStartingRaid,
  startRaidError,
  onClaim,
  onStartRaid,
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
            : `Claim ${projectedReward} NEON`}
      </motion.button>

      {canStartRaid ? (
        <>
          {startRaidError && (
            <p className="text-xs font-bold uppercase tracking-widest text-danger-red">
              {startRaidError}
            </p>
          )}
          <button
            type="button"
            onClick={onStartRaid}
            disabled={isStartingRaid}
            className="text-[10px] uppercase tracking-widest text-neutral-500 underline decoration-dotted underline-offset-2 disabled:opacity-50"
          >
            {isStartingRaid ? 'Starting...' : 'Start Next Raid'}
          </button>
        </>
      ) : (
        <p className="text-[10px] uppercase tracking-widest text-neutral-600">
          A Leader or Co-Leader can start the next raid.
        </p>
      )}
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

interface AttackIdlePanelProps {
  canAttack: boolean;
  msUntilNextAttack: number;
  tapDamagePerHit: number;
  carTier: number;
  attackError: string | null;
  bossImageFailed: boolean;
  onBossImageError: () => void;
  onBeginTapping: () => void;
}

/** The boss is alive and a raid is active, but no tapping session is running right now — either
 * this member's 8h cooldown has elapsed and they can start one, or it hasn't and they see the
 * countdown to when it will. */
function AttackIdlePanel({
  canAttack,
  msUntilNextAttack,
  tapDamagePerHit,
  carTier,
  attackError,
  bossImageFailed,
  onBossImageError,
  onBeginTapping,
}: AttackIdlePanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-amber/30 bg-black/40 p-6">
        <BossPortrait
          failed={bossImageFailed}
          onError={onBossImageError}
          className="mx-auto h-40 w-auto drop-shadow-[0_0_30px_rgba(255,0,60,0.35)]"
        />
      </div>

      <p className="text-center text-xs text-neutral-400">
        Tier {carTier} deals{' '}
        <span className="font-bold text-danger-red">{tapDamagePerHit.toLocaleString()}</span>{' '}
        per tap during your {NIGHT_SIEGE.TAP_PHASE_SECONDS}-second assault window — one window
        every 8 hours.
      </p>

      {attackError && (
        <p className="text-center text-xs font-bold uppercase tracking-widest text-danger-red">
          {attackError}
        </p>
      )}

      <motion.button
        type="button"
        onClick={onBeginTapping}
        disabled={!canAttack}
        whileHover={canAttack ? { scale: 1.02 } : undefined}
        whileTap={canAttack ? { scale: 0.97 } : undefined}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 py-4 font-display text-base font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
          canAttack
            ? 'border-danger-red bg-danger-red/15 text-danger-red shadow-[0_0_28px_rgba(255,0,60,0.35)]'
            : 'border-neutral-700 bg-black/20 text-neutral-500'
        }`}
      >
        {canAttack ? (
          <>
            <Swords className="h-4 w-4" strokeWidth={2.5} />
            Attack
          </>
        ) : (
          `Next Strike In ${formatCountdown(msUntilNextAttack)}`
        )}
      </motion.button>
    </div>
  );
}

interface TappingScreenProps {
  tapPhase: TapPhase;
  tapSecondsLeft: number;
  sessionDamage: number;
  floatingNumbers: FloatingDamage[];
  sparks: Spark[];
  hitCount: number;
  hitOrigin: HitOrigin;
  bossWrapperRef: RefObject<HTMLDivElement | null>;
  onBossTap: (event: MouseEvent<HTMLDivElement>) => void;
  bossImageFailed: boolean;
  onBossImageError: () => void;
}

/** The active tapping window: a countdown, the running session total, and the boss itself as
 * the tap target, staged on top of a scrolling action backdrop. Every tap spawns a floating
 * damage number (.animate-float-up), a bright impact spark (.animate-spark-explode), and a red
 * hit-glow behind the boss (.animate-hit-glow) at/around the tap point, and restarts the boss's
 * hit-shake — all four keyed off the same `hitCount` remount, so a rapid-fire tap cleanly
 * restarts every one of them instead of the second tap landing mid-animation and being ignored.
 * Once `tapPhase` becomes 'submitting' (the timer hit 0), tapping is disabled and a
 * "Submitting..." overlay covers the boss while the session's total is sent to the server. */
function TappingScreen({
  tapPhase,
  tapSecondsLeft,
  sessionDamage,
  floatingNumbers,
  sparks,
  hitCount,
  hitOrigin,
  bossWrapperRef,
  onBossTap,
  bossImageFailed,
  onBossImageError,
}: TappingScreenProps) {
  const isSubmitting = tapPhase === 'submitting';
  const isUrgent = tapSecondsLeft <= 5 && !isSubmitting;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-danger-red/30 bg-black/50 p-3">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">Time Left</span>
        <span
          className={`font-display text-2xl font-black tabular-nums ${
            isUrgent ? 'animate-pulse text-danger-red' : 'text-neutral-100'
          }`}
        >
          00:{tapSecondsLeft.toString().padStart(2, '0')}
        </span>
      </div>

      <div className="rounded-xl border border-amber/40 bg-black/40 p-3 text-center">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Session Damage</p>
        <p className="font-display text-3xl font-black tabular-nums text-amber drop-shadow-[0_0_12px_rgba(255,149,0,0.55)]">
          {sessionDamage.toLocaleString()}
        </p>
      </div>

      <div
        onClick={isSubmitting ? undefined : onBossTap}
        className={`relative flex min-h-[42vh] select-none items-center justify-center overflow-hidden rounded-2xl border-2 border-danger-red/50 ${
          isSubmitting ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        {/* Layer 1 — the scrolling action background (Mirrored Seamless Track, same fix as
         * Smuggler's Run's tunnel — see index.css's .siege-scroll-track comment). */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="siege-scroll-track flex h-full w-[200%]">
            <div className="h-full w-1/2 bg-[url('/background_syndicat.jpg')] bg-bottom bg-no-repeat bg-[length:auto_100%]" />
            <div className="h-full w-1/2 -scale-x-100 bg-[url('/background_syndicat.jpg')] bg-bottom bg-no-repeat bg-[length:auto_100%]" />
          </div>
        </div>

        {/* Static dark overlay — keeps the boss and the UI text readable against the scrolling
         * chaos behind it. */}
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

        {!isSubmitting && (
          <p className="pointer-events-none absolute bottom-4 z-20 text-[10px] uppercase tracking-widest text-neutral-400">
            Tap the Convoy — Deal Damage
          </p>
        )}

        {/* Submitting overlay — covers the whole tap target once the timer hits 0, so there's
         * no ambiguity about whether more taps still count while the batched total is in
         * flight to the server. */}
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/80"
          >
            <Loader2 className="h-8 w-8 animate-spin text-danger-red" strokeWidth={2} />
            <p className="font-display text-sm font-bold uppercase tracking-widest text-danger-red">
              Submitting...
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
