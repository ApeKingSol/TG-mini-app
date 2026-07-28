import { Fragment, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, Coins, ShieldCheck, Siren, Skull, TriangleAlert, X } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import { SMUGGLERS_RUN, type SmugglersRunSector } from '../game/config/economy';
import { getCarTier } from '../game/config/carTiers';
import { cashOutConvoy, resolveSector, startConvoy } from '../game/mock/smugglerApi';

type GameState = 'idle' | 'rolling' | 'decision' | 'busted' | 'cashed_out';
type SectorStatus = 'upcoming' | 'active' | 'cleared' | 'busted';

interface SmugglersRunProps {
  onExit: () => void;
}

const TOTAL_SECTORS = SMUGGLERS_RUN.SECTORS.length;

function getSectorStatus(
  sectorNumber: number,
  currentSector: number,
  gameState: GameState,
): SectorStatus {
  if (sectorNumber === currentSector && gameState === 'busted') return 'busted';
  if (sectorNumber === currentSector && gameState === 'rolling') return 'active';
  if (sectorNumber <= currentSector && gameState !== 'idle') return 'cleared';
  return 'upcoming';
}

export function SmugglersRun({ onExit }: SmugglersRunProps) {
  const neon = useGameStore((state) => state.neon);
  const spendNeon = useGameStore((state) => state.spendNeon);
  const addNeon = useGameStore((state) => state.addNeon);
  const carTier = useGameStore((state) => state.carTier);
  const carImage = getCarTier(carTier).image;

  const [gameState, setGameState] = useState<GameState>('idle');
  const [currentSector, setCurrentSector] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [finalPayout, setFinalPayout] = useState(0);
  const [flash, setFlash] = useState<{ id: string; color: 'green' | 'red' } | null>(null);

  const canAffordFee = neon >= SMUGGLERS_RUN.ENTRY_FEE_NEON;
  const currentSectorConfig: SmugglersRunSector | undefined =
    SMUGGLERS_RUN.SECTORS[currentSector - 1];
  const currentLoot = currentSectorConfig
    ? Math.round(SMUGGLERS_RUN.ENTRY_FEE_NEON * currentSectorConfig.rewardMultiplier)
    : 0;
  const isFinalSector = currentSector === TOTAL_SECTORS;

  // One-shot full-screen color pulse every time a sector's result lands — green on a clear,
  // red on a bust. Keyed by a fresh id each time so re-entering the same gameState (e.g. two
  // busts in separate runs) still re-triggers the animation instead of being a no-op re-render.
  useEffect(() => {
    if (gameState === 'decision') setFlash({ id: crypto.randomUUID(), color: 'green' });
    if (gameState === 'busted') setFlash({ id: crypto.randomUUID(), color: 'red' });
  }, [gameState]);

  const handleStartEngine = async () => {
    if (!canAffordFee || isBusy) return;
    if (!spendNeon(SMUGGLERS_RUN.ENTRY_FEE_NEON, "Smuggler's Run — Entry Fee")) return;
    setIsBusy(true);
    setGameState('rolling');
    setCurrentSector(1);
    await startConvoy(SMUGGLERS_RUN.ENTRY_FEE_NEON);
    const { success } = await resolveSector(1);
    setGameState(success ? 'decision' : 'busted');
    setIsBusy(false);
  };

  const handlePushToNextSector = async () => {
    if (isBusy || isFinalSector) return;
    const nextSector = currentSector + 1;
    setIsBusy(true);
    setGameState('rolling');
    setCurrentSector(nextSector);
    const { success } = await resolveSector(nextSector);
    setGameState(success ? 'decision' : 'busted');
    setIsBusy(false);
  };

  const handleCashOut = async () => {
    if (isBusy || !currentSectorConfig) return;
    setIsBusy(true);
    const { finalMultiplier } = await cashOutConvoy(currentSectorConfig.rewardMultiplier);
    const payout = Math.round(SMUGGLERS_RUN.ENTRY_FEE_NEON * finalMultiplier);
    addNeon(payout, "Smuggler's Run — Cash Out");
    setFinalPayout(payout);
    setGameState('cashed_out');
    setIsBusy(false);
  };

  const handleRunItBack = () => {
    setGameState('idle');
    setCurrentSector(0);
    setFinalPayout(0);
  };

  return (
    <div className="relative flex flex-col gap-4">
      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.id}
            initial={{ opacity: 0.55 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            onAnimationComplete={() => setFlash(null)}
            className={`pointer-events-none fixed inset-0 z-50 ${
              flash.color === 'green' ? 'bg-toxic-green' : 'bg-danger-red'
            }`}
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExit}
          className="flex items-center gap-1 text-xs font-bold text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Hub
        </button>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-danger-red">
          Smuggler's Run
        </p>
        <span className="text-xs font-medium tabular-nums text-neon-magenta">
          {Math.floor(neon).toLocaleString()} NEON
        </span>
      </div>

      <div className="rounded-2xl border border-danger-red/25 bg-white/5 p-5 backdrop-blur-xl">
        <CarStage carImage={carImage} gameState={gameState} />
        <div className="mt-3">
          <SectorTrack currentSector={currentSector} gameState={gameState} />
        </div>
      </div>

      {gameState === 'idle' && (
        <IdleScreen canAffordFee={canAffordFee} onStartEngine={handleStartEngine} />
      )}

      {gameState === 'rolling' && (
        <RollingScreen sector={currentSector} chance={currentSectorConfig?.successChance ?? 0} />
      )}

      {gameState === 'decision' && currentSectorConfig && (
        <DecisionScreen
          currentSector={currentSector}
          isFinalSector={isFinalSector}
          currentLoot={currentLoot}
          nextSector={SMUGGLERS_RUN.SECTORS[currentSector]}
          isBusy={isBusy}
          onCashOut={handleCashOut}
          onPush={handlePushToNextSector}
        />
      )}

      {gameState === 'busted' && (
        <BustedScreen onBackToHub={onExit} onRunItBack={handleRunItBack} />
      )}

      {gameState === 'cashed_out' && (
        <CashedOutScreen
          payout={finalPayout}
          onBackToHub={onExit}
          onRunItBack={handleRunItBack}
        />
      )}
    </div>
  );
}

interface CarStageProps {
  carImage: string;
  gameState: GameState;
}

/** The player's own car, riding a "Mirrored Seamless Track" built from public/bg-tunnel.jpg — a
 * photo that isn't actually a tileable pattern, so a plain `repeat-x` exposed a hard seam every
 * tile. The fix, 3 layers back to front:
 *   1. `.smuggler-track` — a flex strip exactly double the stage's width (`w-[200%]`) holding
 *      two copies of the same image side by side, each `w-1/2` (i.e. exactly one stage-width).
 *      The second copy is horizontally mirrored (`-scale-x-100`), so the seam where they touch
 *      is the image meeting its own reflection — pixel-identical at the boundary, not two
 *      unrelated edges. The whole strip just translates from 0% to -50% (exactly one copy's
 *      width) and loops; that mirrored boundary is the only seam ever visible mid-scroll.
 *   2. A heavy static radial-gradient vignette, deliberately NOT part of the scrolling layer —
 *      without a fixed dark frame anchored behind the car regardless of where the loop
 *      currently is, a bright streak would periodically slide directly behind it and wreck its
 *      silhouette.
 *   3. The car itself — significantly larger now (`w-64`) so it reads as the hero of the scene,
 *      plus its grounding shadow, both absolutely centered above the vignette via z-index.
 * The car image renders at full, solid opacity — no mix-blend-mode — so it never washes out.
 * Rolling swaps the idle float for a hard vibration and floors the track to 3s; a bust
 * desaturates/dims both the car and the track (as two independent filters, so they don't
 * compound into an over-darkened mess) and halts the scroll mid-frame. */
function CarStage({ carImage, gameState }: CarStageProps) {
  const isRolling = gameState === 'rolling';
  const isBusted = gameState === 'busted';
  const isCashedOut = gameState === 'cashed_out';

  const trackModifier = isRolling ? 'is-rolling' : isBusted ? 'is-stopped' : '';

  const stageSirenClass = isRolling
    ? 'smuggler-stage-siren'
    : isCashedOut
      ? 'shadow-[inset_0_0_28px_rgba(57,255,20,0.35)]'
      : '';

  const tireShadowClass = isRolling
    ? 'smuggler-shadow-siren'
    : isBusted
      ? 'bg-neutral-500/20'
      : isCashedOut
        ? 'bg-toxic-green/40'
        : 'bg-neon-cyan/35';

  return (
    <div className={`relative h-48 overflow-hidden rounded-xl border border-white/5 ${stageSirenClass}`}>
      {/* Layer 1 — the infinite mirrored track. */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className={`smuggler-track flex h-full w-[200%] ${trackModifier} ${
            isBusted ? 'grayscale brightness-[0.4]' : ''
          }`}
        >
          <div className="h-full w-1/2 bg-[url('/bg-tunnel.jpg')] bg-cover bg-bottom bg-no-repeat" />
          <div className="h-full w-1/2 -scale-x-100 bg-[url('/bg-tunnel.jpg')] bg-cover bg-bottom bg-no-repeat" />
        </div>
      </div>

      {/* Layer 2 — heavy vignette, anchoring a dark focal frame behind the car regardless of
       * where the loop currently is. */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_rgba(0,0,0,0.9)_75%)]" />

      {/* Layer 3 — car + grounding shadow, both above the vignette. */}
      <div
        className={`absolute bottom-2 left-1/2 z-20 h-4 w-36 -translate-x-1/2 rounded-full blur-lg ${tireShadowClass}`}
      />
      <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2">
        <img
          src={carImage}
          alt="Your convoy car"
          className={`w-64 object-contain drop-shadow-[0_16px_14px_rgba(0,0,0,0.7)] transition-[filter] duration-500 ${
            isRolling ? 'animate-car-shake' : 'animate-car-idle'
          } ${isBusted ? 'grayscale brightness-50' : ''}`}
        />
      </div>
    </div>
  );
}

interface SectorTrackProps {
  currentSector: number;
  gameState: GameState;
}

/** 4 glowing nodes connected by a line — the whole run's map at a glance. Cleared sectors and
 * the line segment leading into them light up toxic-green, the sector currently being resolved
 * pulses amber (tense, outcome unknown yet), a bust marks its sector danger-red, and anything
 * further out just sits dim. Doubles as the idle-state preview (currentSector 0 — every node
 * renders 'upcoming', showing the odds/reward the player is about to commit to). */
function SectorTrack({ currentSector, gameState }: SectorTrackProps) {
  return (
    <div className="flex items-center">
      {SMUGGLERS_RUN.SECTORS.map((sector, index) => {
        const sectorNumber = index + 1;
        const status = getSectorStatus(sectorNumber, currentSector, gameState);
        const leftLineLit =
          index > 0 && getSectorStatus(sectorNumber - 1, currentSector, gameState) === 'cleared';

        return (
          <Fragment key={sectorNumber}>
            {index > 0 && (
              <div className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="absolute inset-y-0 left-0 h-full origin-left rounded-full bg-toxic-green shadow-[0_0_8px_rgba(57,255,20,0.7)] transition-transform duration-700 ease-out"
                  style={{ transform: `scaleX(${leftLineLit ? 1 : 0})` }}
                />
              </div>
            )}
            <SectorNode sectorNumber={sectorNumber} sector={sector} status={status} />
          </Fragment>
        );
      })}
    </div>
  );
}

interface SectorNodeProps {
  sectorNumber: number;
  sector: SmugglersRunSector;
  status: SectorStatus;
}

function SectorNode({ sectorNumber, sector, status }: SectorNodeProps) {
  const dotClass =
    status === 'cleared'
      ? 'border-toxic-green bg-toxic-green/20 text-toxic-green shadow-[0_0_14px_rgba(57,255,20,0.6)]'
      : status === 'active'
        ? 'border-amber bg-amber/15 text-amber animate-node-pulse'
        : status === 'busted'
          ? 'border-danger-red bg-danger-red/25 text-danger-red shadow-[0_0_14px_rgba(255,0,60,0.6)]'
          : 'border-neutral-700 bg-black/30 text-neutral-500';

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-display text-sm font-bold transition-colors duration-300 ${dotClass}`}
      >
        {status === 'cleared' ? (
          <Check className="h-4 w-4" strokeWidth={3} />
        ) : status === 'busted' ? (
          <X className="h-4 w-4" strokeWidth={3} />
        ) : (
          sectorNumber
        )}
      </div>
      <p className="text-[10px] font-medium tabular-nums text-neutral-500">
        {Math.round(sector.successChance * 100)}%
      </p>
      <p className="font-display text-[10px] font-bold tabular-nums text-neutral-400">
        ×{sector.rewardMultiplier}
      </p>
    </div>
  );
}

interface IdleScreenProps {
  canAffordFee: boolean;
  onStartEngine: () => void;
}

function IdleScreen({ canAffordFee, onStartEngine }: IdleScreenProps) {
  return (
    <div className="rounded-2xl border border-danger-red/30 bg-white/5 p-5 text-center backdrop-blur-xl">
      <p className="text-xs uppercase tracking-widest text-neutral-400">
        4 Sectors between you and the drop-off. Every sector cleared is a choice: bank it, or push
        deeper for worse odds and a bigger cut.
      </p>

      <div className="mt-4 rounded-lg border border-neutral-800 bg-black/20 py-3">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Entry Fee</p>
        <p className="font-display text-2xl font-bold tabular-nums text-neon-magenta">
          {SMUGGLERS_RUN.ENTRY_FEE_NEON.toLocaleString()} NEON
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onStartEngine}
        disabled={!canAffordFee}
        whileHover={canAffordFee ? { scale: 1.03 } : undefined}
        whileTap={canAffordFee ? { scale: 0.97 } : undefined}
        className="mt-4 w-full rounded-lg border border-danger-red/60 bg-danger-red/10 py-3.5 font-display text-sm font-bold uppercase tracking-widest text-danger-red shadow-[0_0_20px_rgba(255,0,60,0.25)] transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600 disabled:shadow-none"
      >
        Start Engine
      </motion.button>
      {!canAffordFee && (
        <p className="mt-2 text-center text-xs text-danger-red">Not enough NEON</p>
      )}
    </div>
  );
}

interface RollingScreenProps {
  sector: number;
  chance: number;
}

/** The tense ~1.9s beat between committing to a sector and finding out the result. No plain
 * spinner — a strobing red/blue police-siren wash on the panel itself (.animate-siren-flash),
 * a rapidly vibrating siren icon, and a stuttering glitch-text readout, so the wait itself reads
 * as risk rather than a neutral loading state. */
function RollingScreen({ sector, chance }: RollingScreenProps) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border-2 p-6 backdrop-blur-xl animate-siren-flash">
      <Siren
        className="h-16 w-16 animate-car-shake text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.85)]"
        strokeWidth={1.75}
      />
      <p className="animate-text-glitch font-mono text-base font-bold uppercase tracking-widest text-white">
        {'>> Evading Corp-Sec Scanners... <<'}
      </p>
      <p className="text-xs uppercase tracking-widest text-neutral-300">
        Sector {sector} · {Math.round(chance * 100)}% Clear Chance
      </p>
    </div>
  );
}

interface DecisionScreenProps {
  currentSector: number;
  isFinalSector: boolean;
  currentLoot: number;
  nextSector: SmugglersRunSector | undefined;
  isBusy: boolean;
  onCashOut: () => void;
  onPush: () => void;
}

/** The mandatory fork every cleared sector forces: bank the current haul, or push deeper for a
 * worse-odds, bigger multiplier. Cash Out and Push are deliberately the two biggest controls on
 * this whole screen — this decision is the entire game. */
function DecisionScreen({
  currentSector,
  isFinalSector,
  currentLoot,
  nextSector,
  isBusy,
  onCashOut,
  onPush,
}: DecisionScreenProps) {
  return (
    <div className="rounded-2xl border border-toxic-green/30 bg-white/5 p-5 backdrop-blur-xl">
      <div className="flex items-center justify-center gap-1.5 text-toxic-green">
        <ShieldCheck className="h-4 w-4" strokeWidth={2} />
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">
          Sector {currentSector} Clear
        </p>
      </div>
      <p className="text-center font-display text-4xl font-black tabular-nums text-toxic-green drop-shadow-[0_0_16px_rgba(57,255,20,0.6)]">
        {currentLoot.toLocaleString()} NEON
      </p>
      <p className="text-center text-[10px] uppercase tracking-widest text-neutral-600">
        Current Haul
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <motion.button
          type="button"
          onClick={onCashOut}
          disabled={isBusy}
          whileHover={!isBusy ? { scale: 1.02 } : undefined}
          whileTap={!isBusy ? { scale: 0.98 } : undefined}
          className="animate-safe-pulse flex flex-col items-center gap-0.5 rounded-xl border-2 border-toxic-green bg-toxic-green/10 py-4 transition-opacity disabled:opacity-50"
        >
          <span className="font-display text-base font-black uppercase tracking-widest text-toxic-green">
            Cash Out
          </span>
          <span className="text-[10px] uppercase tracking-widest text-toxic-green/70">
            Safe · Bank {currentLoot.toLocaleString()} NEON
          </span>
        </motion.button>

        {isFinalSector || !nextSector ? (
          <p className="text-center text-[10px] uppercase tracking-widest text-neutral-600">
            Final sector cleared — no further sectors to push into.
          </p>
        ) : (
          <motion.button
            type="button"
            onClick={onPush}
            disabled={isBusy}
            whileHover={!isBusy ? { scale: 1.02 } : undefined}
            whileTap={!isBusy ? { scale: 0.98 } : undefined}
            className="animate-danger-pulse flex flex-col items-center gap-0.5 rounded-xl border-2 border-danger-red bg-danger-red/10 py-4 transition-opacity disabled:opacity-50"
          >
            <span className="animate-text-glitch flex items-center gap-1.5 font-display text-base font-black uppercase tracking-widest text-danger-red drop-shadow-[0_0_10px_rgba(255,0,60,0.9)]">
              <TriangleAlert className="h-4 w-4" strokeWidth={2.5} />
              Push to Sector {currentSector + 1}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-danger-red/70">
              High Risk · {Math.round(nextSector.successChance * 100)}% Clear · ×
              {nextSector.rewardMultiplier} Reward
            </span>
          </motion.button>
        )}
      </div>
    </div>
  );
}

interface BustedScreenProps {
  onBackToHub: () => void;
  onRunItBack: () => void;
}

function BustedScreen({ onBackToHub, onRunItBack }: BustedScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex min-h-[45vh] flex-col items-center justify-center gap-4 rounded-2xl border border-danger-red/40 bg-black/60 p-6 text-center backdrop-blur-xl"
    >
      <Skull
        className="h-14 w-14 text-danger-red drop-shadow-[0_0_20px_rgba(255,0,60,0.75)]"
        strokeWidth={1.5}
      />
      <div>
        <p className="animate-text-glitch font-display text-3xl font-black uppercase leading-tight tracking-widest text-danger-red drop-shadow-[0_0_28px_rgba(255,0,60,0.85)]">
          System Lockdown
        </p>
        <p className="mt-1 font-mono text-sm uppercase tracking-[0.3em] text-danger-red/80">
          // Cargo Seized //
        </p>
      </div>
      <p className="text-xs uppercase tracking-widest text-neutral-600">
        Entry fee forfeited — the run is over.
      </p>

      <div className="mt-2 flex w-full flex-col gap-2">
        <motion.button
          type="button"
          onClick={onRunItBack}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="w-full rounded-lg border border-danger-red/50 bg-danger-red/10 py-3 font-display text-sm font-bold uppercase tracking-wide text-danger-red"
        >
          Run It Back
        </motion.button>
        <button
          type="button"
          onClick={onBackToHub}
          className="w-full rounded-lg border border-neutral-700 py-2.5 text-xs uppercase tracking-wide text-neutral-400"
        >
          Back to Hub
        </button>
      </div>
    </motion.div>
  );
}

interface CashedOutScreenProps {
  payout: number;
  onBackToHub: () => void;
  onRunItBack: () => void;
}

function CashedOutScreen({ payout, onBackToHub, onRunItBack }: CashedOutScreenProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex min-h-[45vh] flex-col items-center justify-center gap-4 rounded-2xl border border-toxic-green/40 bg-black/60 p-6 text-center backdrop-blur-xl"
    >
      <Coins
        className="h-14 w-14 text-toxic-green drop-shadow-[0_0_20px_rgba(57,255,20,0.75)]"
        strokeWidth={1.5}
      />
      <p className="font-display text-2xl font-black uppercase tracking-widest text-toxic-green drop-shadow-[0_0_24px_rgba(57,255,20,0.75)]">
        Transfer Complete
      </p>
      <p className="font-display text-4xl font-black tabular-nums text-toxic-green">
        +{payout.toLocaleString()} NEON
      </p>

      <div className="mt-2 flex w-full flex-col gap-2">
        <motion.button
          type="button"
          onClick={onRunItBack}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="w-full rounded-lg border border-toxic-green/60 bg-toxic-green/10 py-3 font-display text-sm font-bold uppercase tracking-wide text-toxic-green"
        >
          Run It Back
        </motion.button>
        <button
          type="button"
          onClick={onBackToHub}
          className="w-full rounded-lg border border-neutral-700 py-2.5 text-xs uppercase tracking-wide text-neutral-400"
        >
          Back to Hub
        </button>
      </div>
    </motion.div>
  );
}
