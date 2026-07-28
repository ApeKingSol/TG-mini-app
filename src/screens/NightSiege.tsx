import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { Hourglass, Lock, ShieldAlert, Swords, Trophy, Truck } from 'lucide-react';
import {
  NIGHT_SIEGE,
  getNightSiegeDamage,
  getNightSiegeReward,
  isBossAttackAvailable,
  type SyndicateRole,
} from '../game/config/economy';
import { useGameStore } from '../game/store/GameStore';
import {
  claimBossReward,
  fetchConvoyStatus,
  spawnNextRaid,
  submitDamage,
  type ConvoyStatus,
} from '../game/mock/siegeApi';

/** How long the post-strike floating damage number/shake stays visible — purely cosmetic,
 * unrelated to the 8h attack cooldown itself. */
const HIT_FLOURISH_DURATION_MS = 900;
/** The HP bar is drawn as this many discrete blocks rather than one smooth fill — a chunkier,
 * more "raid boss health bar" read than a plain gradient bar. */
const HP_SEGMENT_COUNT = 20;
/** How often the shared Convoy HP re-polls while idle — so another Syndicate member's attack
 * (or a kill/claim/next-raid someone else triggered) shows up without needing to leave and
 * re-enter the tab. */
const IDLE_POLL_INTERVAL_MS = 5000;

interface NightSiegeProps {
  /** Which Syndicate's shared Convoy to raid — the whole HP pool, damage submissions, and kill
   * claims are scoped to this id (see netlify/functions/night-siege.mts, keyed by syndicateId).
   * Always the current player's own Syndicate; SyndicateHub.tsx only ever mounts this once
   * `mySyndicate` is known. */
  syndicateId: string;
  /** The current player's standing in that Syndicate — SyndicateHub.tsx already computes this
   * for its own roster, so it's passed down rather than re-derived here. Drives both the
   * declare-gate (only 'leader'/'co-leader' can land the opening strike on a fresh Convoy) and
   * which reward tier the claim preview shows. */
  myRole: SyndicateRole;
  /** Fired every time a fresh ConvoyStatus is fetched (initial load or idle poll) — lets
   * SyndicateHub.tsx's roster show each member's damage without running its own second,
   * redundant poller against the same endpoint. */
  onDamageLogUpdate?: (damageLog: Record<string, number>) => void;
}

/** Zero-pads and formats a countdown as HH:MM:SS — both the 8h attack cooldown and the 72h boss
 * lifetime can run well past a minute, so unlike a mini-game timer this always needs the hours
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
 * is the only way to leave. Each member gets one deterministic strike against the shared
 * Corporate Convoy every NIGHT_SIEGE.ATTACK_COOLDOWN_MS, sized by their own car tier — no
 * tapping, no randomness, the damage number shown before attacking is exactly what lands. A
 * fresh Convoy has to be declared by the Leader or a Co-Leader before regular members can join
 * in (their own opening strike does the declaring, no separate action needed). Once the shared
 * HP reaches 0, every current member can claim their role-tiered $NEON reward exactly once for
 * that kill. */
export function NightSiege({ syndicateId, myRole, onDamageLogUpdate }: NightSiegeProps) {
  const carTier = useGameStore((state) => state.carTier);
  const lastBossAttackTime = useGameStore((state) => state.lastBossAttackTime);
  const recordBossAttack = useGameStore((state) => state.recordBossAttack);
  const lastClaimedBossId = useGameStore((state) => state.lastClaimedBossId);
  const creditBossKillReward = useGameStore((state) => state.creditBossKillReward);

  const [convoyStatus, setConvoyStatus] = useState<ConvoyStatus | null>(null);
  const [bossImageFailed, setBossImageFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [isAttacking, setIsAttacking] = useState(false);
  const [attackError, setAttackError] = useState<string | null>(null);
  const [lastHitDamage, setLastHitDamage] = useState<number | null>(null);
  const [hitFlash, setHitFlash] = useState(0);

  const [isClaiming, setIsClaiming] = useState(false);
  const [isSpawningNext, setIsSpawningNext] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const bossWrapperRef = useRef<HTMLDivElement>(null);

  // The countdown(s) need a live clock of its own — nothing else on this screen ticks every
  // second while sitting idle.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Every fetched status (initial load or poll) also reports damageLog upstream, so
  // SyndicateHub.tsx's roster stays current without its own second poller hitting the same
  // endpoint — fewer concurrent requests against the same boss record means less chance of the
  // exact kind of read/write race that made the expiry countdown misbehave before.
  const applyConvoyStatus = (status: ConvoyStatus) => {
    setConvoyStatus(status);
    onDamageLogUpdate?.(status.damageLog ?? {});
  };

  useEffect(() => {
    fetchConvoyStatus(syndicateId)
      .then(applyConvoyStatus)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syndicateId]);

  // Keeps the shared HP bar honest while sitting idle — another member's strike, a kill, or
  // someone else starting the next raid should all show up on their own, without needing to
  // leave and re-enter the tab.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchConvoyStatus(syndicateId)
        .then(applyConvoyStatus)
        .catch(() => {});
    }, IDLE_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syndicateId]);

  const isBossDefeated = convoyStatus !== null && convoyStatus.currentHp <= 0;
  const alreadyClaimed =
    convoyStatus !== null &&
    (convoyStatus.alreadyClaimed || lastClaimedBossId === convoyStatus.bossId);
  // A legacy boss record predating isDeclared normalizes to `true` server-side, and a status
  // that hasn't loaded yet defaults to "open" too, rather than flashing a false "waiting on
  // your Leader" panel for every member while the very first fetch is still in flight.
  const isDeclared = convoyStatus === null || convoyStatus.isDeclared;
  const canDeclare = myRole !== 'member';
  const isBlockedByDeclareGate = !isDeclared && !canDeclare;

  // isBossAttackAvailable itself treats anything that isn't a real, finite number (not just
  // `null`) as "never attacked, go ahead" — so canAttackByCooldown being false guarantees
  // lastBossAttackTime is a genuine finite timestamp below, and the Number()/Math.max wrapping
  // here is a second, redundant safety net on top of that for the same "never show NaN, never
  // lock forever on bad data" reason.
  const canAttackByCooldown = isBossAttackAvailable(lastBossAttackTime, now);
  const canAttack = canAttackByCooldown && !isBossDefeated && !isBlockedByDeclareGate;
  const msUntilNextAttack = canAttackByCooldown
    ? 0
    : Math.max(0, NIGHT_SIEGE.ATTACK_COOLDOWN_MS - (now - Number(lastBossAttackTime)));
  const projectedDamage = getNightSiegeDamage(carTier);
  const projectedReward = getNightSiegeReward(myRole);

  const handleAttack = async () => {
    if (!canAttack || isAttacking) return;
    setAttackError(null);
    setIsAttacking(true);
    try {
      const updated = await submitDamage(syndicateId, carTier);
      const attackedAt = Date.now();
      applyConvoyStatus(updated);
      recordBossAttack(attackedAt);
      setLastHitDamage(projectedDamage);
      setHitFlash((count) => count + 1);
      window.setTimeout(() => setLastHitDamage(null), HIT_FLOURISH_DURATION_MS);
    } catch (err) {
      setAttackError(err instanceof Error ? err.message.toUpperCase() : 'ATTACK FAILED');
    } finally {
      setIsAttacking(false);
    }
  };

  const handleClaim = async () => {
    if (!convoyStatus || isClaiming) return;
    setClaimError(null);
    setIsClaiming(true);
    try {
      const result = await claimBossReward(syndicateId);
      creditBossKillReward(result.bossId, result.rewardNeon);
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
      applyConvoyStatus(fresh);
    } catch {
      // Best-effort — the next idle poll/remount catches up regardless.
    } finally {
      setIsSpawningNext(false);
    }
  };

  const hpPercent = convoyStatus
    ? Math.max(0, Math.min(100, (convoyStatus.currentHp / convoyStatus.maxHp) * 100))
    : 0;
  // A legacy boss record predating bossExpiresAt would otherwise leave this NaN — night-siege.mts
  // now backfills a fresh expiry for exactly that case, but this stays defensive on the client
  // too rather than trusting the server response's shape unconditionally.
  const msUntilExpiry =
    convoyStatus && Number.isFinite(convoyStatus.bossExpiresAt)
      ? convoyStatus.bossExpiresAt - now
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center font-display text-sm font-bold uppercase tracking-widest text-danger-red">
        Night Siege
      </p>

      <ConvoyHpBar hpPercent={hpPercent} convoyStatus={convoyStatus} msUntilExpiry={msUntilExpiry} />

      {isBossDefeated ? (
        <BossDefeatedPanel
          alreadyClaimed={alreadyClaimed}
          isClaiming={isClaiming}
          isSpawningNext={isSpawningNext}
          claimError={claimError}
          projectedReward={projectedReward}
          onClaim={handleClaim}
          onSpawnNext={handleSpawnNext}
        />
      ) : isBlockedByDeclareGate ? (
        <WaitingForDeclarationPanel
          bossImageFailed={bossImageFailed}
          onBossImageError={() => setBossImageFailed(true)}
        />
      ) : (
        <AttackPanel
          bossImageFailed={bossImageFailed}
          onBossImageError={() => setBossImageFailed(true)}
          canAttack={canAttack}
          isAttacking={isAttacking}
          msUntilNextAttack={msUntilNextAttack}
          projectedDamage={projectedDamage}
          carTier={carTier}
          lastHitDamage={lastHitDamage}
          hitFlash={hitFlash}
          bossWrapperRef={bossWrapperRef}
          attackError={attackError}
          isDeclaring={!isDeclared && canDeclare}
          onAttack={handleAttack}
        />
      )}
    </div>
  );
}

interface ConvoyHpBarProps {
  hpPercent: number;
  convoyStatus: ConvoyStatus | null;
  msUntilExpiry: number;
}

/** The Convoy's shared HP — a raid-wide total every Syndicate member's damage chips away at,
 * not anything this session alone moves. Drawn as discrete segments rather than one smooth
 * bar for a chunkier "boss health bar" read. Shows a countdown to the boss's own 72h expiry
 * while it's still alive, so the Syndicate can see the raid is actually time-limited. */
function ConvoyHpBar({ hpPercent, convoyStatus, msUntilExpiry }: ConvoyHpBarProps) {
  const filledSegments = Math.round((hpPercent / 100) * HP_SEGMENT_COUNT);
  const isDefeated = convoyStatus !== null && convoyStatus.currentHp <= 0;

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

      {convoyStatus && !isDefeated && (
        <p className="mt-1 flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-neutral-600">
          <Hourglass className="h-2.5 w-2.5" strokeWidth={2} />
          Convoy escapes in {formatCountdown(msUntilExpiry)}
        </p>
      )}
    </div>
  );
}

interface BossDefeatedPanelProps {
  alreadyClaimed: boolean;
  isClaiming: boolean;
  isSpawningNext: boolean;
  claimError: string | null;
  /** getNightSiegeReward(myRole) — the amount *this* claim will pay out. The actual credited
   * amount always comes from the claim response itself (see handleClaim), this is purely a
   * pre-claim preview so the button can say exactly what it's about to pay before it's pressed. */
  projectedReward: number;
  onClaim: () => void;
  onSpawnNext: () => void;
}

/** Shown whenever the shared Convoy HP has actually reached 0. Every current member can claim
 * their own role-tiered $NEON reward exactly once for this kill (server-enforced — see
 * night-siege.mts's handleClaim/getNightSiegeReward); "Start Next Raid" is a separate, explicit
 * action so a member who hasn't had the chance to claim yet can't have that window closed out
 * from under them by someone else moving on first. */
function BossDefeatedPanel({
  alreadyClaimed,
  isClaiming,
  isSpawningNext,
  claimError,
  projectedReward,
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
            : `Claim ${projectedReward} NEON`}
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

interface WaitingForDeclarationPanelProps {
  bossImageFailed: boolean;
  onBossImageError: () => void;
}

/** Shown to a regular member when a fresh Convoy hasn't been declared yet — they can see the
 * boss is there, but the Leader or a Co-Leader has to land the opening strike first (which
 * declares it for the whole Syndicate in the same action, no separate "declare" button exists
 * on their side either). Deliberately not just a disabled Attack button with generic cooldown
 * text — this is a genuinely different reason to be blocked and reads much clearer spelled out. */
function WaitingForDeclarationPanel({
  bossImageFailed,
  onBossImageError,
}: WaitingForDeclarationPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex min-h-[32vh] items-center justify-center overflow-hidden rounded-2xl border-2 border-neutral-700 bg-black/40 p-6 opacity-70 grayscale">
        <BossPortrait
          failed={bossImageFailed}
          onError={onBossImageError}
          className="h-48 w-auto"
        />
      </div>

      <div className="flex flex-col items-center gap-2 rounded-xl border border-amber/40 bg-amber/10 p-4 text-center">
        <Lock className="h-5 w-5 text-amber" strokeWidth={2} />
        <p className="font-display text-sm font-bold uppercase tracking-widest text-amber">
          Awaiting Orders
        </p>
        <p className="text-xs text-amber/80">
          Only the Leader or a Co-Leader can declare the attack on this Convoy. Once they land
          the first strike, every member can join in.
        </p>
      </div>
    </div>
  );
}

interface AttackPanelProps {
  bossImageFailed: boolean;
  onBossImageError: () => void;
  canAttack: boolean;
  isAttacking: boolean;
  msUntilNextAttack: number;
  projectedDamage: number;
  carTier: number;
  lastHitDamage: number | null;
  hitFlash: number;
  bossWrapperRef: RefObject<HTMLDivElement | null>;
  attackError: string | null;
  /** True when this player is a Leader/Co-Leader striking an undeclared Convoy — their attack
   * both deals damage and opens the raid for the rest of the Syndicate in the same action. */
  isDeclaring: boolean;
  onAttack: () => void;
}

/** The boss + one big Attack button — no tapping, no timer, no session. Each press is a single
 * server-confirmed strike for exactly getNightSiegeDamage(carTier) damage, then the button goes
 * on cooldown for NIGHT_SIEGE.ATTACK_COOLDOWN_MS. `hitFlash` (an incrementing counter, not a
 * boolean) is what re-triggers the shake/glow/floating-number trio on every single press, even
 * back-to-back ones after the cooldown resets — a boolean toggle can't retrigger a CSS animation
 * that's already mid-flight the same way remounting a keyed element can. */
function AttackPanel({
  bossImageFailed,
  onBossImageError,
  canAttack,
  isAttacking,
  msUntilNextAttack,
  projectedDamage,
  carTier,
  lastHitDamage,
  hitFlash,
  bossWrapperRef,
  attackError,
  isDeclaring,
  onAttack,
}: AttackPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex min-h-[32vh] items-center justify-center overflow-hidden rounded-2xl border-2 border-danger-red/50 bg-black/40 p-6">
        <div
          key={hitFlash}
          ref={bossWrapperRef}
          className={`relative ${hitFlash > 0 ? 'animate-heavy-shake' : ''}`}
        >
          <div
            className={`pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(255,0,60,0.7),transparent_70%)] opacity-0 ${
              hitFlash > 0 ? 'animate-hit-glow' : ''
            }`}
          />
          <BossPortrait
            failed={bossImageFailed}
            onError={onBossImageError}
            className="h-48 w-auto drop-shadow-[0_0_30px_rgba(255,0,60,0.35)]"
          />
        </div>

        {lastHitDamage !== null && (
          <span
            key={hitFlash}
            className="animate-float-up pointer-events-none absolute z-20 font-display text-3xl font-black text-danger-red drop-shadow-[0_0_10px_rgba(255,0,60,0.85)]"
          >
            -{lastHitDamage.toLocaleString()}
          </span>
        )}
      </div>

      <p className="text-center text-xs text-neutral-400">
        Tier {carTier} deals{' '}
        <span className="font-bold text-danger-red">{projectedDamage.toLocaleString()}</span>{' '}
        damage per strike — one strike every 8 hours.
      </p>

      {isDeclaring && (
        <p className="text-center text-[11px] uppercase tracking-widest text-amber">
          You'll be the first to strike — this declares the raid for the whole Syndicate.
        </p>
      )}

      {attackError && (
        <p className="text-center text-xs font-bold uppercase tracking-widest text-danger-red">
          {attackError}
        </p>
      )}

      <motion.button
        type="button"
        onClick={onAttack}
        disabled={!canAttack || isAttacking}
        whileHover={canAttack && !isAttacking ? { scale: 1.02 } : undefined}
        whileTap={canAttack && !isAttacking ? { scale: 0.97 } : undefined}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 py-4 font-display text-base font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
          canAttack
            ? 'border-danger-red bg-danger-red/15 text-danger-red shadow-[0_0_28px_rgba(255,0,60,0.35)]'
            : 'border-neutral-700 bg-black/20 text-neutral-500'
        }`}
      >
        {isAttacking ? (
          'Striking...'
        ) : canAttack ? (
          <>
            <Swords className="h-4 w-4" strokeWidth={2.5} />
            {isDeclaring ? 'Declare & Attack' : 'Attack Convoy'}
          </>
        ) : (
          `Next Strike In ${formatCountdown(msUntilNextAttack)}`
        )}
      </motion.button>
    </div>
  );
}
