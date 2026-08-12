import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Award, Gauge, Lock, Package, Radio, type LucideIcon } from 'lucide-react';
import { useGameStore, getTelegramUserId } from '../game/store/GameStore';
import {
  AUTO_DRAG,
  getCarStats,
  NEON_SYPHON,
  getNeonSyphonReward,
  isNeonSyphonClaimable,
  isOverclockActive,
} from '../game/config/economy';
import { getCarTier, getLeagueForTier } from '../game/config/carTiers';
import {
  acceptMatchFromDatabase,
  fetchLobbyMatches,
  hostMatchToDatabase,
  subscribeToMatchResult,
  type OpenChallenge,
} from '../game/mock/matchmaking';
import { fetchMySyndicate, type Syndicate } from '../game/mock/syndicateApi';
import { PlayerLobby, type LobbyView } from './PlayerLobby';
import { SmugglersRun } from './SmugglersRun';
import { SyndicateHub } from './SyndicateHub';
import type { CarStats } from '../game/types';

type RaceView = 'hub' | 'auto-drag' | 'smugglers-run';
type StreetsTab = 'lone-wolf' | 'syndicates';

export function RaceScreen() {
  const [view, setView] = useState<RaceView>('hub');
  // Lives here (not inside the hub component) so it survives a round-trip into Auto-Drag or
  // Smuggler's Run and back — returning to the hub lands back on whichever tab the player left.
  const [activeTab, setActiveTab] = useState<StreetsTab>('lone-wolf');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="pt-4"
    >
      {view === 'hub' && (
        <TheStreetsHub
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          onSelectAutoDrag={() => setView('auto-drag')}
          onSelectSmugglersRun={() => setView('smugglers-run')}
        />
      )}
      {view === 'auto-drag' && <AutoDragRace onExit={() => setView('hub')} />}
      {view === 'smugglers-run' && <SmugglersRun onExit={() => setView('hub')} />}
    </motion.div>
  );
}

interface TheStreetsHubProps {
  activeTab: StreetsTab;
  onChangeTab: (tab: StreetsTab) => void;
  onSelectAutoDrag: () => void;
  onSelectSmugglersRun: () => void;
}

/** The Streets' top-level hub — a persistent Neon balance readout, a Lone Wolf/Syndicates tab
 * toggle, and whichever tab's content that selects. Night Siege isn't a mode card here at all
 * anymore: it's gated behind Syndicate membership and lives entirely inside SyndicateHub, so
 * solo players never see an entry point to it outside the Syndicates tab. */
function TheStreetsHub({
  activeTab,
  onChangeTab,
  onSelectAutoDrag,
  onSelectSmugglersRun,
}: TheStreetsHubProps) {
  return (
    <div className="flex flex-col gap-4">
      <StreetCredPanel />

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 bg-black/20 p-1">
        <button
          type="button"
          onClick={() => onChangeTab('lone-wolf')}
          className={`rounded-lg py-2.5 font-display text-xs font-bold uppercase tracking-wide transition-colors ${
            activeTab === 'lone-wolf'
              ? 'border border-neon-cyan bg-neon-cyan/15 text-neon-cyan shadow-[0_0_16px_rgba(0,240,255,0.35)]'
              : 'border border-transparent text-neutral-400'
          }`}
        >
          Lone Wolf
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('syndicates')}
          className={`rounded-lg py-2.5 font-display text-xs font-bold uppercase tracking-wide transition-colors ${
            activeTab === 'syndicates'
              ? 'border border-amber bg-amber/15 text-amber shadow-[0_0_16px_rgba(255,149,0,0.35)]'
              : 'border border-transparent text-neutral-400'
          }`}
        >
          Syndicates
        </button>
      </div>

      {activeTab === 'lone-wolf' && (
        <div className="flex flex-col gap-4">
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
            accentClass="border-danger-red/40 bg-danger-red/5 text-danger-red"
            onClick={onSelectSmugglersRun}
          />
          <NeonSyphonCard />
        </div>
      )}

      {activeTab === 'syndicates' && <SyndicateHub />}
    </div>
  );
}

/** Replaces the old flat "Syndicate Balance" readout (that's what CurrencyBar's NEON tile
 * already shows, right at the top of the whole app — repeating it here was pure duplication)
 * with the actually-useful context a player wants at a glance before picking a mode: which
 * League their current car tier puts them in, whether they're riding solo or repping a
 * Syndicate (and in what role), and whether an Overclock boost is currently ticking. */
function StreetCredPanel() {
  const carTier = useGameStore((state) => state.carTier);
  const boostEndsAt = useGameStore((state) => state.boostEndsAt);
  const myId = getTelegramUserId();

  const [now, setNow] = useState(() => Date.now());
  const [mySyndicate, setMySyndicate] = useState<Syndicate | null>(null);
  const [isLoadingSyndicate, setIsLoadingSyndicate] = useState(true);

  // Needed for both the Overclock countdown and (indirectly) freshness of "is the boost still
  // active" — nothing else on this panel ticks every second while sitting idle.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchMySyndicate()
      .then(setMySyndicate)
      .finally(() => setIsLoadingSyndicate(false));
  }, []);

  const league = getLeagueForTier(carTier);
  const overclockActive = isOverclockActive(boostEndsAt, now);
  const overclockMsRemaining = boostEndsAt !== null ? Math.max(0, boostEndsAt - now) : 0;

  const syndicateLabel = (() => {
    if (isLoadingSyndicate) return '...';
    if (!mySyndicate) return 'Lone Wolf';
    const isLeader = myId !== null && myId === mySyndicate.leaderId;
    const isCoLeader = myId !== null && mySyndicate.coLeaderIds.includes(myId);
    const role = isLeader ? 'Leader' : isCoLeader ? 'Co-Leader' : 'Member';
    return `${role} — [${mySyndicate.tag}] ${mySyndicate.name}`;
  })();

  return (
    <div className="rounded-xl border border-neon-magenta/40 bg-neon-magenta/10 p-4">
      <div className="flex items-center gap-1.5 text-neon-magenta">
        <Award className="h-4 w-4" strokeWidth={2} />
        <p className="font-display text-xs font-bold uppercase tracking-widest">Street Cred</p>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">League</span>
        <span className="font-display text-sm font-bold text-neon-magenta">{league.name}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="shrink-0 text-[10px] uppercase tracking-widest text-neutral-500">
          Syndicate
        </span>
        <span className="truncate font-display text-sm font-bold text-neon-magenta">
          {syndicateLabel}
        </span>
      </div>

      <div className="mt-3 border-t border-neon-magenta/20 pt-2 text-center">
        {overclockActive ? (
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-amber drop-shadow-[0_0_8px_rgba(255,149,0,0.6)]">
            Overclock: {formatSyphonCountdown(overclockMsRemaining)}
          </p>
        ) : (
          <p className="font-mono text-xs uppercase tracking-widest text-neutral-600">
            System Normal
          </p>
        )}
      </div>
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

/** Zero-pads and formats a countdown as HH:MM:SS — Neon Syphon's cooldown can run up to 24h,
 * so unlike the Garage's energy-regen countdown (always under 5 minutes, MM:SS is enough) this
 * needs the hours place too. */
function formatSyphonCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
}

/** The Streets' free, 24h-gated $NEON trickle — the one way a Free-to-Play player earns premium
 * currency without racing or paying. Unlike the other two mode cards (which just navigate
 * elsewhere), this one *is* the whole interaction: a live countdown while on cooldown, or a
 * one-tap claim showing exactly what it pays out for the player's current carTier, right on the
 * button — nothing to navigate into. */
function NeonSyphonCard() {
  const carTier = useGameStore((state) => state.carTier);
  const lastNeonSyphonTime = useGameStore((state) => state.lastNeonSyphonTime);
  const claimNeonSyphon = useGameStore((state) => state.claimNeonSyphon);

  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<number | null>(null);

  // The countdown needs a live clock of its own — nothing else on this screen ticks every
  // second while sitting idle on the hub.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const claimable = isNeonSyphonClaimable(lastNeonSyphonTime, now);
  const reward = getNeonSyphonReward(carTier);
  const msRemaining =
    lastNeonSyphonTime === null ? 0 : NEON_SYPHON.COOLDOWN_MS - (now - lastNeonSyphonTime);

  const handleClaim = () => {
    const granted = claimNeonSyphon();
    if (granted === null) return; // cooldown ticked over between render and click — no-op
    setFlash(granted);
    window.setTimeout(() => setFlash(null), 2000);
  };

  return (
    <div className="rounded-xl border border-neon-cyan/40 bg-neon-cyan/5 p-4">
      <div className="flex items-center gap-3">
        <Radio className="h-8 w-8 shrink-0 text-neon-cyan" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-neon-cyan">
            Neon Syphon
          </p>
          <p className="text-xs text-neutral-500">Passive Extraction</p>
        </div>
      </div>

      <p className="mt-3 font-mono text-[11px] uppercase tracking-wide text-neon-cyan/70">
        Current: Tier {carTier} | Profit: {reward} NEON / 24h
      </p>

      <motion.button
        type="button"
        onClick={handleClaim}
        disabled={!claimable}
        whileHover={claimable ? { scale: 1.02 } : undefined}
        whileTap={claimable ? { scale: 0.97 } : undefined}
        className={`mt-3 w-full rounded-lg border-2 py-2.5 font-display text-sm font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
          claimable
            ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan shadow-[0_0_16px_rgba(0,240,255,0.35)]'
            : 'border-neutral-700 bg-black/20 text-neutral-500'
        }`}
      >
        {claimable ? `Claim ${reward} NEON` : `Available in ${formatSyphonCountdown(msRemaining)}`}
      </motion.button>

      <AnimatePresence>
        {flash !== null && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-neon-cyan"
          >
            +{flash} NEON
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

const AUTO_DRAG_FLOAT_DURATION_MS = 800;

type AutoDragState = 'betting' | 'racing' | 'finished';
type RaceMode = 'player' | 'bot';
type RaceSide = 'player' | 'rival';

interface FloatEvent {
  id: string;
  text: 'NITRO!' | 'DRIFT!';
}

/** Sum of the 3 stats that matter for a race — durability is a Syndicate Drag-only concept
 * (this mode has no HP/damage mechanic) so it's deliberately left out of the power total. */
function getStatPower(stats: Pick<CarStats, 'topSpeed' | 'acceleration' | 'handling'>): number {
  return stats.topSpeed + stats.acceleration + stats.handling;
}

/** Syndicate Bot's total power — a flat, disclosed-difficulty baseline scaled up by
 * BOT_RIVAL_STAT_MULTIPLIER. Race vs Player doesn't use this at all: a real (mock, for now)
 * opponent's power comes straight from their own car tier via getStatPower(getCarStats(...)),
 * same as the player's — see resolveMatch below. */
function getBotRivalPower(): number {
  return AUTO_DRAG.BOT_RIVAL_BASE_STAT * 3 * AUTO_DRAG.BOT_RIVAL_STAT_MULTIPLIER;
}

/** The single number driving both the UI's "Win Chance" readout AND the actual race RNG roll
 * — see startRace below, which rolls against exactly this value for either mode. There is no
 * second, hidden number; what's displayed is what's used. Clamped so neither side is ever a
 * mathematical lock, same reasoning as a real bookmaker never posting 0% or 100%. */
function computeWinChancePercent(playerPower: number, rivalPower: number): number {
  const raw = (playerPower / (playerPower + rivalPower)) * 100;
  return Math.round(
    Math.min(AUTO_DRAG.MAX_WIN_CHANCE_PERCENT, Math.max(AUTO_DRAG.MIN_WIN_CHANCE_PERCENT, raw)),
  );
}

interface RaceSegmentOptions {
  finalTotal: number;
  boostIndex?: number;
  boostMultiplier?: number;
  stumbleIndex?: number;
  stumbleMultiplier?: number;
  frontLoadIndices?: number[];
  frontLoadMultiplier?: number;
}

/** Builds one car's per-segment progress deltas for the scripted race animation: random
 * weights, optionally biased at specific indices for a "NITRO!" surge, a "DRIFT!" stumble, or
 * an early front-loaded lead, then normalized so they sum to exactly `finalTotal`. The winner
 * is always built with finalTotal 100 and the loser with something short of it (see
 * AUTO_DRAG.LOSER_FINAL_PROGRESS_MIN/MAX) — the outcome is locked in before any of this runs,
 * this only shapes how the animation gets there. */
function buildRaceSegments({
  finalTotal,
  boostIndex,
  boostMultiplier = 1,
  stumbleIndex,
  stumbleMultiplier = 1,
  frontLoadIndices = [],
  frontLoadMultiplier = 1,
}: RaceSegmentOptions): number[] {
  const weights = Array.from({ length: AUTO_DRAG.RACE_STEPS }, () => 0.6 + Math.random() * 0.8);
  if (boostIndex !== undefined) weights[boostIndex] *= boostMultiplier;
  if (stumbleIndex !== undefined) weights[stumbleIndex] *= stumbleMultiplier;
  frontLoadIndices.forEach((index) => {
    weights[index] *= frontLoadMultiplier;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (weight / total) * finalTotal);
}

/** Running totals *before* each segment (index 0 is always 0), so the rAF loop can interpolate
 * within the current segment without re-summing the array every frame. */
function cumulativeSums(segments: number[]): number[] {
  const cumulative = [0];
  segments.forEach((segment) => cumulative.push(cumulative[cumulative.length - 1] + segment));
  return cumulative;
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
  const recordRaceResult = useGameStore((state) => state.recordRaceResult);

  const stats = getCarStats(carTier, installedUpgrades);
  const playerCarImage = getCarTier(carTier).image;

  const [raceMode, setRaceMode] = useState<RaceMode>('player');
  const [betAmount, setBetAmount] = useState<number>(AUTO_DRAG.BET_TIERS[0]);
  const [rivalCarImage, setRivalCarImage] = useState<string>(getCarTier(1).image);
  const [raceState, setRaceState] = useState<AutoDragState>('betting');
  const [playerProgress, setPlayerProgress] = useState(0);
  const [rivalProgress, setRivalProgress] = useState(0);
  const [playerFloats, setPlayerFloats] = useState<FloatEvent[]>([]);
  const [rivalFloats, setRivalFloats] = useState<FloatEvent[]>([]);
  const [playerBoosting, setPlayerBoosting] = useState(false);
  const [rivalBoosting, setRivalBoosting] = useState(false);
  const [winner, setWinner] = useState<RaceSide | null>(null);

  // --- Race vs Player lobby state (mock matchmaking — see src/game/mock/matchmaking.ts) ---
  const league = getLeagueForTier(carTier);
  const [lobbyView, setLobbyView] = useState<LobbyView>('browse');
  const [openChallenges, setOpenChallenges] = useState<OpenChallenge[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [acceptingMatchId, setAcceptingMatchId] = useState<string | null>(null);
  const [hostBetAmount, setHostBetAmount] = useState<number>(AUTO_DRAG.BET_TIERS[0]);
  const cancelHostRef = useRef<(() => void) | null>(null);
  // Guards against a stale subscribeToMatchResult starting after the player already cancelled
  // hosting while hostMatchToDatabase's own "create the match" call was still in flight.
  const hostActiveRef = useRef(false);

  // Refs mirror the state above as the single source of truth read *inside* the rAF loop —
  // reading React state directly there risks acting on a one-render-stale value if two
  // updates land before a re-render commits (the same lesson from the Anti-Stall/Garage
  // calibration mini-game).
  const raceStateRef = useRef<AutoDragState>('betting');
  const raceStartRef = useRef(0);
  const stepDurationRef = useRef(0);
  const totalDurationRef = useRef(0);
  const winnerRef = useRef<RaceSide | null>(null);
  const playerSegmentsRef = useRef<number[]>([]);
  const rivalSegmentsRef = useRef<number[]>([]);
  const playerCumulativeRef = useRef<number[]>([0]);
  const rivalCumulativeRef = useRef<number[]>([0]);
  const playerBoostStepRef = useRef<number | null>(null);
  const rivalBoostStepRef = useRef<number | null>(null);
  const playerStumbleStepRef = useRef<number | null>(null);
  const rivalStumbleStepRef = useRef<number | null>(null);
  const lastStepIndexRef = useRef(-1);
  const rafRef = useRef<number | null>(null);

  const playerPower = getStatPower(stats);
  // Only meaningful for Syndicate Bot's betting screen now — Race vs Player shows a per-
  // opponent estimate instead (see MatchCard), computed the same honest way once a real
  // opponent's tier is known.
  const botWinChance = computeWinChancePercent(playerPower, getBotRivalPower());

  const canAffordBet = neon >= betAmount;
  const hostCanAfford = neon >= hostBetAmount;
  const grossMultiplier =
    raceMode === 'bot' ? AUTO_DRAG.GROSS_WIN_MULTIPLIER_BOT : AUTO_DRAG.GROSS_WIN_MULTIPLIER_PLAYER;
  const grossPayout = Math.round(betAmount * grossMultiplier);
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

  // Brief "wheelie" tilt + brightness pulse on a NITRO!, auto-clearing itself — see the
  // `.car-boost` class in index.css for what this actually renders.
  const triggerPlayerBoost = () => {
    setPlayerBoosting(true);
    window.setTimeout(() => setPlayerBoosting(false), 500);
  };

  const triggerRivalBoost = () => {
    setRivalBoosting(true);
    window.setTimeout(() => setRivalBoosting(false), 500);
  };

  // The entire outcome is resolved right here, in one roll against the exact percentage that
  // was (or could have been) shown to the player for this specific opponent — everything from
  // this point on (segments, boosts, stumbles) only scripts how the animation dramatizes an
  // outcome that's already locked in. Shared by both Syndicate Bot's "Start Race" button and
  // Race vs Player's resolveMatch below, parameterized by whatever bet/opponent got the player
  // here — see those two call sites for how each fills in rivalPowerValue/rivalImage.
  const beginRace = (
    bet: number,
    rivalPowerValue: number,
    rivalImage: string,
    betLabel: string,
  ): boolean => {
    if (neon < bet || !spendNeon(bet, betLabel)) return false;

    setBetAmount(bet);
    setRivalCarImage(rivalImage);

    const playerScore = playerPower + (Math.random() * 100);
    const opponentScore = rivalPowerValue + (Math.random() * 100);
    const winnerSide: RaceSide = playerScore > opponentScore ? 'player' : 'rival';
    winnerRef.current = winnerSide;

    const boostIndex = 3 + Math.floor(Math.random() * 3);
    const stumbleIndex =
      Math.random() < AUTO_DRAG.STUMBLE_CHANCE ? Math.floor(Math.random() * 3) : undefined;
    const frontLoad = Math.random() < AUTO_DRAG.FRONT_LOAD_CHANCE;
    const loserTotal =
      AUTO_DRAG.LOSER_FINAL_PROGRESS_MIN +
      Math.random() * (AUTO_DRAG.LOSER_FINAL_PROGRESS_MAX - AUTO_DRAG.LOSER_FINAL_PROGRESS_MIN);

    const winnerSegments = buildRaceSegments({
      finalTotal: 100,
      boostIndex,
      boostMultiplier: AUTO_DRAG.WINNER_BOOST_MULTIPLIER,
    });
    const loserSegments = buildRaceSegments({
      finalTotal: loserTotal,
      stumbleIndex,
      stumbleMultiplier: AUTO_DRAG.LOSER_STUMBLE_MULTIPLIER,
      frontLoadIndices: frontLoad ? [0, 1] : [],
      frontLoadMultiplier: AUTO_DRAG.FRONT_LOAD_MULTIPLIER,
    });

    const playerSegments = winnerSide === 'player' ? winnerSegments : loserSegments;
    const rivalSegments = winnerSide === 'player' ? loserSegments : winnerSegments;
    playerSegmentsRef.current = playerSegments;
    rivalSegmentsRef.current = rivalSegments;
    playerCumulativeRef.current = cumulativeSums(playerSegments);
    rivalCumulativeRef.current = cumulativeSums(rivalSegments);

    playerBoostStepRef.current = winnerSide === 'player' ? boostIndex : null;
    rivalBoostStepRef.current = winnerSide === 'rival' ? boostIndex : null;
    playerStumbleStepRef.current = winnerSide === 'rival' ? (stumbleIndex ?? null) : null;
    rivalStumbleStepRef.current = winnerSide === 'player' ? (stumbleIndex ?? null) : null;
    lastStepIndexRef.current = -1;

    setPlayerProgress(0);
    setRivalProgress(0);
    setPlayerFloats([]);
    setRivalFloats([]);
    setPlayerBoosting(false);
    setRivalBoosting(false);
    setWinner(null);

    const duration =
      AUTO_DRAG.RACE_DURATION_MIN_SECONDS +
      Math.random() * (AUTO_DRAG.RACE_DURATION_MAX_SECONDS - AUTO_DRAG.RACE_DURATION_MIN_SECONDS);
    totalDurationRef.current = duration;
    stepDurationRef.current = duration / AUTO_DRAG.RACE_STEPS;

    raceStartRef.current = performance.now();
    raceStateRef.current = 'racing';
    setRaceState('racing');
    return true;
  };

  // --- Race vs Player lobby handlers (mock matchmaking) ---
  const refreshLobbyMatches = () => {
    setIsFetching(true);
    setLobbyError(null);
    fetchLobbyMatches(league.id)
      .then((challenges) => setOpenChallenges(challenges))
      .catch((err: unknown) => {
        // Previously silent (no .catch at all) — a failed fetch just left openChallenges at
        // whatever it already was, which reads identically to "no one's racing right now"
        // even when the real cause is a broken/misconfigured backend (e.g. a missing
        // TELEGRAM_BOT_TOKEN making every authenticated call 401). Surfacing the actual error
        // here is what would have made that kind of misconfiguration diagnosable from the UI
        // itself instead of needing a screenshot-hunting session.
        setLobbyError(err instanceof Error ? err.message.toUpperCase() : 'COULD NOT REACH LOBBY');
      })
      .finally(() => setIsFetching(false));
  };

  useEffect(() => {
    if (raceState === 'betting' && raceMode === 'player' && lobbyView === 'browse') {
      refreshLobbyMatches();
    }
    // TODO real backend: swap the effect above for a live subscription to the league's open-
    // match list (WebSocket message or polling interval) instead of only fetching on view entry
    // — see the comment inside fetchLobbyMatches in matchmaking.ts for exactly where that goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceState, raceMode, lobbyView, league.id]);

  // Cancels any in-flight mock "waiting for opponent" timer if the player backs all the way
  // out of Auto-Drag mid-host — a real backend would need the equivalent (closing the hosted
  // match / unsubscribing) here too.
  useEffect(() => {
    return () => {
      hostActiveRef.current = false;
      cancelHostRef.current?.();
    };
  }, []);

  /** One real (mock, for now) opponent's stats come from their own tier, same as the
   * player's — no flat baseline, no jitter, nothing hidden. */
  const resolveMatch = (opponent: OpenChallenge) => {
    const rivalPowerValue = getStatPower(getCarStats(opponent.opponentCarTier, []));
    const rivalImage = getCarTier(opponent.opponentCarTier).image;
    beginRace(
      opponent.betAmount,
      rivalPowerValue,
      rivalImage,
      `Auto-Drag — Bet (vs ${opponent.opponentName})`,
    );
  };

  const startHosting = () => {
    if (!hostCanAfford) return;
    setLobbyView('hosting');
    hostActiveRef.current = true;
    hostMatchToDatabase(hostBetAmount, carTier)
      .then(({ matchId }) => {
        // The player may have already cancelled while this "create the match" call was in
        // flight — don't start waiting for an opponent on a match that was just torn down.
        if (!hostActiveRef.current) return;
        cancelHostRef.current = subscribeToMatchResult(matchId, (opponent) => {
          cancelHostRef.current = null;
          resolveMatch(opponent);
        });
      })
      .catch(() => {
        // Hosting itself failed (network error, or running outside Telegram where there's no
        // initData to authenticate with) — don't leave the player stuck on "Waiting for
        // Opponent..." forever with only a Cancel button that has nothing left to cancel.
        if (!hostActiveRef.current) return;
        hostActiveRef.current = false;
        setLobbyView('browse');
      });
  };

  const cancelHosting = () => {
    hostActiveRef.current = false;
    cancelHostRef.current?.();
    cancelHostRef.current = null;
    setLobbyView('browse');
  };

  const handleAcceptMatch = (challenge: OpenChallenge) => {
    if (neon < challenge.betAmount || acceptingMatchId !== null) return;
    setAcceptingMatchId(challenge.id);
    acceptMatchFromDatabase(challenge.id, carTier)
      .then((confirmed) => {
        setAcceptingMatchId(null);
        resolveMatch(confirmed);
      })
      .catch(() => {
        // Someone else claimed it first — drop it from the list and let the player pick again.
        setAcceptingMatchId(null);
        refreshLobbyMatches();
      });
  };

  useEffect(() => {
    if (raceState !== 'racing') return;

    const step = () => {
      const elapsedSeconds = (performance.now() - raceStartRef.current) / 1000;
      const totalDuration = totalDurationRef.current;
      const clampedElapsed = Math.min(elapsedSeconds, totalDuration);

      const stepFloat = clampedElapsed / stepDurationRef.current;
      const stepIndex = Math.min(AUTO_DRAG.RACE_STEPS - 1, Math.floor(stepFloat));
      const fraction = Math.min(1, stepFloat - stepIndex);

      setPlayerProgress(
        playerCumulativeRef.current[stepIndex] + playerSegmentsRef.current[stepIndex] * fraction,
      );
      setRivalProgress(
        rivalCumulativeRef.current[stepIndex] + rivalSegmentsRef.current[stepIndex] * fraction,
      );

      if (stepIndex !== lastStepIndexRef.current) {
        lastStepIndexRef.current = stepIndex;
        if (stepIndex === playerBoostStepRef.current) {
          pushPlayerFloat('NITRO!');
          triggerPlayerBoost();
        }
        if (stepIndex === rivalBoostStepRef.current) {
          pushRivalFloat('NITRO!');
          triggerRivalBoost();
        }
        if (stepIndex === playerStumbleStepRef.current) pushPlayerFloat('DRIFT!');
        if (stepIndex === rivalStumbleStepRef.current) pushRivalFloat('DRIFT!');
      }

      if (elapsedSeconds >= totalDuration) {
        const finalWinner = winnerRef.current;
        raceStateRef.current = 'finished';
        setPlayerProgress(finalWinner === 'player' ? 100 : playerCumulativeRef.current.at(-1)!);
        setRivalProgress(finalWinner === 'rival' ? 100 : rivalCumulativeRef.current.at(-1)!);
        setWinner(finalWinner);
        setRaceState('finished');
        if (finalWinner === 'player') addNeon(netPayout, `Auto-Drag — Win (${raceMode})`);
        recordRaceResult(finalWinner === 'player' ? 'win' : 'loss');
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

  const raceAgain = () => {
    setLobbyView('browse');
    setRaceState('betting');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 text-xs font-bold text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Hub
        </button>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-neon-magenta">
          Auto-Drag
        </p>
        <span className="text-xs font-medium tabular-nums text-neon-magenta">{neon} NEON</span>
      </div>

      {raceState === 'betting' && (
        <>
          <div className="rounded-xl border border-neon-magenta/30 bg-white/5 p-4 backdrop-blur-xl">
            <p className="text-center text-xs uppercase tracking-widest text-neutral-400">
              Choose Your Opponent
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRaceMode('player');
                  setLobbyView('browse');
                }}
                className={`rounded-lg border py-2.5 font-display text-xs font-bold uppercase tracking-wide transition-colors ${
                  raceMode === 'player'
                    ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan shadow-[0_0_16px_rgba(0,240,255,0.35)]'
                    : 'border-neutral-700 bg-black/20 text-neutral-400'
                }`}
              >
                Race vs Player
              </button>
              <button
                type="button"
                onClick={() => setRaceMode('bot')}
                className={`rounded-lg border py-2.5 font-display text-xs font-bold uppercase tracking-wide transition-colors ${
                  raceMode === 'bot'
                    ? 'border-neon-magenta bg-neon-magenta/15 text-neon-magenta shadow-[0_0_16px_rgba(255,46,230,0.35)]'
                    : 'border-neutral-700 bg-black/20 text-neutral-400'
                }`}
              >
                Syndicate Bot
              </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-neutral-600">
              {raceMode === 'bot'
                ? 'Hardened rival, lower odds — bigger payout if you take it.'
                : 'Real racers, League-matched — same odds either side can see.'}
            </p>
          </div>

          {raceMode === 'bot' && (
            <div className="rounded-xl border border-neon-magenta/30 bg-white/5 p-4 backdrop-blur-xl">
              <div className="rounded-lg border border-neutral-800 bg-black/20 py-3 text-center">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500">
                  Win Chance
                </p>
                <p
                  className={`font-display text-3xl font-bold tabular-nums ${
                    botWinChance >= 55
                      ? 'text-neon-cyan'
                      : botWinChance >= 40
                        ? 'text-amber'
                        : 'text-red-400'
                  }`}
                >
                  {botWinChance}%
                </p>
              </div>

              <p className="mt-4 text-center text-xs uppercase tracking-widest text-neutral-400">
                Place Your Bet
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
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
                onClick={() =>
                  beginRace(
                    betAmount,
                    getBotRivalPower(),
                    getCarTier(18).image,
                    'Auto-Drag — Bet (bot)',
                  )
                }
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

          {raceMode === 'player' && (
            <PlayerLobby
              league={league}
              betTiers={AUTO_DRAG.BET_TIERS}
              lobbyView={lobbyView}
              openChallenges={openChallenges}
              isFetching={isFetching}
              loadError={lobbyError}
              acceptingMatchId={acceptingMatchId}
              hostBetAmount={hostBetAmount}
              hostCanAfford={hostCanAfford}
              computeWinChance={(opponentCarTier) =>
                computeWinChancePercent(playerPower, getStatPower(getCarStats(opponentCarTier, [])))
              }
              onSetHostBetAmount={setHostBetAmount}
              onStartHosting={startHosting}
              onCancelHosting={cancelHosting}
              onRefreshMatches={refreshLobbyMatches}
              onAcceptMatch={handleAcceptMatch}
            />
          )}
        </>
      )}

      {(raceState === 'racing' || raceState === 'finished') && (
        <div className="relative flex min-h-[60vh] flex-col overflow-hidden rounded-2xl border border-neon-cyan/20 bg-black/80 p-6 backdrop-blur-xl">
          <div className="auto-drag-track" aria-hidden="true" />

          <div className="relative z-10 flex flex-1 flex-col justify-center gap-8">
            <div className="grid grid-cols-2 gap-5">
              <CarLane
                label="You"
                imageSrc={playerCarImage}
                progress={playerProgress}
                colorClass="bg-neon-cyan"
                glowColor="cyan"
                floats={playerFloats}
                isBoosting={playerBoosting}
              />
              <CarLane
                label="Rival"
                imageSrc={rivalCarImage}
                progress={rivalProgress}
                colorClass="bg-neon-magenta"
                glowColor="magenta"
                floats={rivalFloats}
                isBoosting={rivalBoosting}
              />
            </div>
            <p className="text-center text-xs uppercase tracking-widest text-neutral-600">
              {betAmount} NEON on the line — hands off the wheel
            </p>
          </div>

          {raceState === 'finished' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm"
            >
              <motion.p
                initial={{ scale: 1.8, opacity: 0, rotate: -6 }}
                animate={{ scale: 1, opacity: 1, rotate: -4 }}
                transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 16 }}
                className={`font-display text-5xl font-black uppercase tracking-widest ${
                  winner === 'player'
                    ? 'text-neon-cyan drop-shadow-[0_0_28px_rgba(0,240,255,0.85)]'
                    : 'text-red-500 drop-shadow-[0_0_28px_rgba(239,68,68,0.85)]'
                }`}
              >
                {winner === 'player' ? 'Victory' : 'Defeat'}
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.25 }}
                className="text-center"
              >
                {winner === 'player' ? (
                  <>
                    <p className="text-xs text-neutral-400">
                      Gross {grossPayout} NEON − {tax} NEON tax
                    </p>
                    <p className="mt-1 font-display text-3xl font-bold text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]">
                      +{netPayout} NEON
                    </p>
                  </>
                ) : (
                  <p className="font-display text-2xl font-bold text-red-400">
                    −{betAmount} NEON
                  </p>
                )}
              </motion.div>

              <motion.button
                type="button"
                onClick={raceAgain}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.25 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="mt-2 rounded-lg border border-neutral-600 bg-white/10 px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-neutral-100"
              >
                Claim &amp; Continue
              </motion.button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

interface CarLaneProps {
  label: string;
  imageSrc: string;
  progress: number;
  colorClass: string;
  glowColor: 'cyan' | 'magenta';
  floats: FloatEvent[];
  isBoosting: boolean;
}

/** One lane of the drag strip, three independently-animated layers so their transforms don't
 * fight each other: the outer div creeps forward (translateX) as progress climbs, the middle
 * div owns the continuous "bumpy road" wobble (`animate-road-bump`, infinite), and the img
 * itself only reacts to a NITRO! (`.car-boost` — brightness pulse + wheelie tilt, eased in/out
 * over 0.3s by the plain CSS transition rather than a second keyframe animation). The big
 * italic percentage and thin glowing bar sit below, with floating NITRO!/DRIFT! callouts
 * overlaid on top of both. */
function CarLane({
  label,
  imageSrc,
  progress,
  colorClass,
  glowColor,
  floats,
  isBoosting,
}: CarLaneProps) {
  const textGlowClass =
    glowColor === 'cyan'
      ? 'text-neon-cyan drop-shadow-[0_0_14px_rgba(0,240,255,0.65)]'
      : 'text-neon-magenta drop-shadow-[0_0_14px_rgba(255,46,230,0.65)]';

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${(progress / 100) * 16}px)` }}
      >
        <div className="animate-road-bump">
          <img
            src={imageSrc}
            alt={label}
            className={`h-16 w-auto object-contain transition-[filter,transform] duration-300 ease-out ${
              isBoosting ? 'car-boost' : ''
            }`}
          />
        </div>
      </div>

      <div className="relative w-full">
        <p
          className={`text-center font-mono text-4xl font-black italic tabular-nums ${textGlowClass}`}
        >
          {Math.round(progress)}%
        </p>
        <FloatingEvents events={floats} />
      </div>

      <p className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</p>

      <RaceProgressBar value={progress} colorClass={colorClass} glowColor={glowColor} instant />
    </div>
  );
}

/** Floating "NITRO!"/"DRIFT!" callouts over a progress bar — absolutely positioned within
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
              event.text === 'NITRO!' ? 'text-neon-cyan' : 'text-amber'
            }`}
            style={{ left: `${10 + index * 18}%` }}
          >
            {event.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

interface RaceProgressBarProps {
  value: number;
  colorClass: string;
  /** Skips the Framer Motion transition for bars driven by a continuous per-frame value
   * (recomputed fresh from the race script every rAF tick) — animating *toward* a target that
   * itself moves every frame just makes the bar chase a perpetually-stale position, the exact
   * bug fixed on the Garage's Calibration bar. */
  instant?: boolean;
  /** Adds a box-shadow glow that intensifies as `value` approaches 100, in the given color. */
  glowColor?: 'cyan' | 'magenta';
}

const GLOW_RGB: Record<'cyan' | 'magenta', string> = {
  cyan: '0, 240, 255',
  magenta: '255, 46, 230',
};

/** Just the glowing bar itself — CarLane renders the label and the big percentage separately,
 * above this, so this component no longer owns any text. */
function RaceProgressBar({ value, colorClass, instant, glowColor }: RaceProgressBarProps) {
  const glowStyle = glowColor
    ? {
        boxShadow: `0 0 ${6 + (value / 100) * 20}px rgba(${GLOW_RGB[glowColor]}, ${(
          0.25 +
          (value / 100) * 0.55
        ).toFixed(2)})`,
      }
    : undefined;

  return (
    <div className="w-full">
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-800">
        {instant ? (
          <div
            className={`h-full origin-left rounded-full ${colorClass}`}
            style={{ transform: `scaleX(${value / 100})`, ...glowStyle }}
          />
        ) : (
          <motion.div
            className={`h-full origin-left rounded-full ${colorClass}`}
            animate={{ scaleX: value / 100 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            style={glowStyle}
          />
        )}
      </div>
    </div>
  );
}
