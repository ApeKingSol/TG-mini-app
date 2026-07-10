import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Store, X, Lock } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useGameStore } from '../game/store/GameStore';
import { PartSlot } from '../components/PartSlot';
import { Tachometer } from '../components/Tachometer';
import { useEngineAudio } from '../hooks/useEngineAudio';
import {
  ECONOMY,
  ANTI_STALL,
  getPartBuyCost,
  getSecondsUntilNextEnergyRegen,
  getCarStats,
} from '../game/config/economy';
import { getPartTier, PERK_DESCRIPTIONS, type PartPerk } from '../game/config/parts';
import { getCarTier, getUpgradeRequirement, getCarSkins } from '../game/config/carTiers';
import type { CarStats } from '../game/types';

const CAR_INSTALLATION_ZONE_ID = 'car-installation-zone';

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function GarageScreen() {
  const scrap = useGameStore((state) => state.scrap);
  const car = useGameStore((state) => state.car);
  const carTier = useGameStore((state) => state.carTier);
  const inventory = useGameStore((state) => state.inventory);
  const partsPurchased = useGameStore((state) => state.partsPurchased);
  const energy = useGameStore((state) => state.energy);
  const maxEnergy = useGameStore((state) => state.maxEnergy);
  const energyRegenAmount = useGameStore((state) => state.energyRegenAmount);
  const lastEnergyRegenAt = useGameStore((state) => state.lastEnergyRegenAt);
  const installedUpgrades = useGameStore((state) => state.installedUpgrades);
  const buyPart = useGameStore((state) => state.buyPart);
  const movePart = useGameStore((state) => state.movePart);
  const mergeParts = useGameStore((state) => state.mergeParts);
  const pendingCalibrationPart = useGameStore((state) => state.pendingCalibrationPart);
  const startCalibration = useGameStore((state) => state.startCalibration);
  const completeCalibration = useGameStore((state) => state.completeCalibration);
  const tradeInCar = useGameStore((state) => state.tradeInCar);

  const [justMergedId, setJustMergedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' } | null>(
    null,
  );
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Only the countdown text needs a live clock — everything else re-renders from store
  // updates already. A plain 1s interval is simplest and cheap enough for a single label.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const partCost = getPartBuyCost(carTier, partsPurchased);
  const canBuyPart = scrap >= partCost && inventory.some((slot) => slot === null);
  const upgradeRequirement = getUpgradeRequirement(carTier);
  const isMastered = installedUpgrades.length >= upgradeRequirement;
  const secondsUntilEnergyRegen = getSecondsUntilNextEnergyRegen(
    energy,
    maxEnergy,
    lastEnergyRegenAt,
    now,
  );

  // PointerSensor alone covers mouse, touch, and pen — dnd-kit's own guidance is to avoid
  // layering a separate TouchSensor/MouseSensor on top, since they'd react to the same
  // input and can fight each other. `distance` lets a plain tap pass through as a tap
  // instead of starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const showToast = (message: string, variant: 'error' | 'success' = 'error') => {
    setToast({ message, variant });
    window.setTimeout(() => setToast(null), 2500);
  };

  const handleCalibrationComplete = (success: boolean) => {
    const perk = pendingCalibrationPart?.perk;
    completeCalibration(success);
    if (success && perk) {
      showToast(`Upgrade installed — ${perk}: ${PERK_DESCRIPTIONS[perk]}`, 'success');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const draggedIndex = inventory.findIndex((part) => part?.id === active.id);
    if (draggedIndex === -1) return;
    const dragged = inventory[draggedIndex]!;

    if (over.id === CAR_INSTALLATION_ZONE_ID) {
      if (dragged.level < ECONOMY.MAX_PART_LEVEL) {
        showToast('Only Max Level (Lv.4) parts can be installed.');
        return;
      }
      startCalibration(draggedIndex);
      return;
    }

    const targetMatch = /^slot-(\d+)$/.exec(String(over.id));
    if (!targetMatch) return;
    const targetIndex = Number(targetMatch[1]);
    if (targetIndex === draggedIndex) return;

    const target = inventory[targetIndex];
    if (target && target.level === dragged.level && dragged.level < ECONOMY.MAX_PART_LEVEL) {
      if (energy < ECONOMY.MERGE_ENERGY_COST) {
        showToast(`Not enough energy to merge (-${ECONOMY.MERGE_ENERGY_COST}).`);
        return;
      }
      const result = mergeParts(draggedIndex, targetIndex);
      if (result) {
        setJustMergedId(result.part.id);
        window.setTimeout(() => setJustMergedId(null), 500);
        if (result.isCrit) {
          showToast(`CRITICAL MERGE! Jumped straight to Lv.${result.part.level}`, 'success');
        }
      }
    } else {
      movePart(draggedIndex, targetIndex);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4 pt-4"
    >
      <div className="flex w-full items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
          [ Garage ]
        </p>
        <motion.button
          type="button"
          onClick={() => setIsShopOpen(true)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="panel-cut-sm flex items-center gap-1 border border-neon-cyan/50 bg-neon-cyan/10 px-3 py-1.5 font-mono text-xs font-semibold text-neon-cyan"
        >
          <Store className="h-3.5 w-3.5" strokeWidth={2} />
          SHOP
        </motion.button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <CarInstallationZone
          carName={car.name}
          carTier={carTier}
          upgradesInstalled={installedUpgrades.length}
          upgradesRequired={upgradeRequirement}
          carStats={getCarStats(carTier, installedUpgrades)}
        />

        {isMastered ? (
          <TradeInPanel installedUpgrades={installedUpgrades} onTradeIn={tradeInCar} />
        ) : (
          <>
            <AnimatePresence>
              {pendingCalibrationPart && (
                <AntiStallCalibrationPanel
                  partLevel={pendingCalibrationPart.level}
                  perk={pendingCalibrationPart.perk}
                  onComplete={handleCalibrationComplete}
                />
              )}
            </AnimatePresence>

            <div className="panel-cut relative border border-neutral-800 bg-bg-panel p-4">
              <span className="pointer-events-none absolute right-2 top-1 select-none font-mono text-[8px] uppercase tracking-widest text-neutral-600">
                RIG.03
              </span>
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs uppercase tracking-widest text-neutral-500">
                  Merge Grid
                </p>
                <motion.button
                  type="button"
                  onClick={buyPart}
                  disabled={!canBuyPart}
                  whileHover={canBuyPart ? { scale: 1.05 } : undefined}
                  whileTap={canBuyPart ? { scale: 0.95 } : undefined}
                  className="panel-cut-sm whitespace-nowrap border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Buy Part (-{partCost})
                </motion.button>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                Drag a part onto a matching part to merge it up a tier ({ECONOMY.MERGE_ENERGY_COST}{' '}
                Energy). Drag a Lv.{ECONOMY.MAX_PART_LEVEL} part onto the car to install it.
              </p>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3 text-neon-magenta" strokeWidth={2} />
                    Energy
                  </span>
                  <span className="tabular-nums">
                    {Math.floor(energy)} / {maxEnergy}
                    {secondsUntilEnergyRegen > 0 && (
                      <span className="ml-2 text-neutral-600">
                        +{energyRegenAmount} in {formatCountdown(secondsUntilEnergyRegen)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden border border-neutral-800 bg-neutral-900">
                  <motion.div
                    className="h-full bg-gradient-to-r from-neon-magenta to-neon-cyan"
                    animate={{ width: `${(energy / maxEnergy) * 100}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-3">
                {inventory.map((part, index) => (
                  <PartSlot
                    key={index}
                    index={index}
                    part={part}
                    justMerged={part?.id === justMergedId}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </DndContext>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            className={`panel-cut-sm fixed inset-x-4 top-4 z-50 border bg-bg-panel/95 px-4 py-3 text-center shadow-lg backdrop-blur ${
              toast.variant === 'success' ? 'border-green-400/50' : 'border-red-400/50'
            }`}
          >
            <p
              className={`text-sm font-medium ${
                toast.variant === 'success' ? 'text-green-300' : 'text-red-300'
              }`}
            >
              {toast.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isShopOpen && <SkinShopModal carTier={carTier} onClose={() => setIsShopOpen(false)} />}
      </AnimatePresence>
    </motion.div>
  );
}

interface SkinShopModalProps {
  carTier: number;
  onClose: () => void;
}

/** Skins are purely cosmetic and not purchasable yet — shown as "In Development" so
 * players can see what's coming without a half-built purchase/skin-swap flow. */
function SkinShopModal({ carTier, onClose }: SkinShopModalProps) {
  const skins = getCarSkins(carTier);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-24 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: -24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -24, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(event) => event.stopPropagation()}
        className="panel-cut w-full max-w-xs border border-neon-cyan/50 bg-bg-panel p-4 text-left shadow-lg"
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-sm font-bold uppercase tracking-widest text-neon-cyan">
            Skin Shop
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-500 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-2 text-xs text-neutral-500">
          Cosmetic skins for your current car. In development — coming soon.
        </p>

        <div className="flex flex-col gap-2">
          {skins.map((skin) => (
            <div
              key={skin.id}
              className="panel-cut-sm flex items-center justify-between border border-neutral-800 bg-black/30 px-3 py-2 opacity-60"
            >
              <p className="text-sm font-medium text-neutral-200">{skin.name}</p>
              <span className="flex items-center gap-1 font-mono text-xs font-medium text-neutral-500">
                <Lock className="h-3.5 w-3.5" /> In Development
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

interface CarInstallationZoneProps {
  carName: string;
  carTier: number;
  upgradesInstalled: number;
  upgradesRequired: number;
  carStats: CarStats;
}

function CarInstallationZone({
  carName,
  carTier,
  upgradesInstalled,
  upgradesRequired,
  carStats,
}: CarInstallationZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: CAR_INSTALLATION_ZONE_ID });
  const upgradesRemaining = Math.max(0, upgradesRequired - upgradesInstalled);

  return (
    // No background fill or box-shadow here on purpose: a `drop-shadow`/`shadow-*` glow
    // traces the image's alpha silhouette, and its blur bleeds into the car art's own
    // transparent gaps (e.g. between the wheels and undercarriage), reading as a muddy
    // halo baked into the vehicle rather than a shadow behind it. The border alone gives
    // drop-zone feedback without touching anything inside the car's silhouette.
    <div
      ref={setNodeRef}
      className={`panel-cut relative overflow-hidden border p-4 transition-colors ${
        isOver ? 'border-neon-cyan/70' : 'border-neutral-800'
      }`}
    >
      <span className="pointer-events-none absolute right-2 top-1 select-none font-mono text-[8px] uppercase tracking-widest text-amber/50">
        Chassis.{String(carTier).padStart(2, '0')}
      </span>
      <p className="text-center font-display text-lg font-bold uppercase tracking-wide text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.6)]">
        {carName}
      </p>
      <p className="text-center font-mono text-sm font-semibold text-neon-cyan">
        Upgrades Installed: {upgradesInstalled} / {upgradesRequired}
      </p>
      <p className="mb-3 text-center text-xs text-neutral-500">
        {upgradesRemaining} parts left until Next Tier
      </p>

      <StatsPanel stats={carStats} />

      {/* Keyed on carTier so a trade-in re-triggers this AnimatePresence: the outgoing car
         drives off to the right while the new one drops in from the top. The outer element
         owns that one-shot enter/exit transform; the inner motion.img owns the perpetual
         idle bob independently, so the two animations don't fight over the same transform. */}
      <AnimatePresence mode="wait">
        <motion.div
          key={carTier}
          initial={{ y: '-140%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ x: '130%', opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        >
          <motion.img
            src={getCarTier(carTier).image}
            alt={carName}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto w-full max-w-sm object-contain"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Stat bars are normalized against this reference ceiling purely for visual fill —
 * stats keep climbing with car tier forever, so a fixed 100 max would pin every bar at full
 * within a few tiers. This just keeps the bars meaningful at a glance for longer. */
const STATS_PANEL_DISPLAY_MAX = 300;

const STAT_DISPLAY_ORDER: { key: keyof CarStats; label: string; colorClass: string }[] = [
  { key: 'topSpeed', label: 'Speed', colorClass: 'bg-neon-cyan' },
  { key: 'acceleration', label: 'Accel', colorClass: 'bg-neon-magenta' },
  { key: 'durability', label: 'HP', colorClass: 'bg-green-400' },
  { key: 'handling', label: 'Handling', colorClass: 'bg-amber-400' },
];

function StatsPanel({ stats }: { stats: CarStats }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2">
      {STAT_DISPLAY_ORDER.map(({ key, label, colorClass }) => {
        const value = stats[key];
        const fillPercent = Math.min(100, (value / STATS_PANEL_DISPLAY_MAX) * 100);
        return (
          <div key={key}>
            <div className="mb-0.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-neutral-500">
              <span>{label}</span>
              <span className="tabular-nums text-neutral-400">{value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden border border-neutral-800/80 bg-neutral-900">
              <div
                className={`h-full origin-left ${colorClass}`}
                style={{ transform: `scaleX(${fillPercent / 100})` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TradeInPanelProps {
  installedUpgrades: PartPerk[];
  onTradeIn: () => void;
}

function TradeInPanel({ installedUpgrades, onTradeIn }: TradeInPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="panel-cut relative flex flex-col items-center gap-4 border border-neon-cyan/50 bg-bg-panel p-6 text-center"
    >
      <span className="pointer-events-none absolute right-2 top-1 select-none font-mono text-[8px] uppercase tracking-widest text-neon-cyan/50">
        Status.Ready
      </span>
      <p className="font-display text-lg font-bold tracking-wide text-neon-cyan drop-shadow-[0_0_4px_rgba(0,240,255,0.9)]">
        CAR MASTERED
      </p>
      <div className="flex flex-col gap-1 font-mono text-sm text-neutral-400">
        {installedUpgrades.map((perk, index) => (
          <span key={`${perk}-${index}`}>✓ {perk}</span>
        ))}
      </div>
      <p className="font-mono text-xs text-neon-cyan/80">
        Trade-in bonus: +{Math.round(ECONOMY.TRADE_IN_SCRAP_PER_SECOND_GROWTH * 100)}% Scrap/sec
      </p>
      <motion.button
        type="button"
        onClick={onTradeIn}
        animate={{
          boxShadow: [
            '0 0 6px 1px rgba(0,240,255,0.5)',
            '0 0 12px 2px rgba(0,240,255,0.8)',
            '0 0 6px 1px rgba(0,240,255,0.5)',
          ],
        }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        whileTap={{ scale: 0.96 }}
        className="panel-cut w-full border-2 border-neon-cyan bg-neon-cyan/10 px-6 py-4 font-display text-base font-extrabold tracking-wide text-neon-cyan"
      >
        CONTACT SYNDICATE (TRADE-IN)
      </motion.button>
    </motion.div>
  );
}

interface AntiStallCalibrationPanelProps {
  partLevel: number;
  perk: PartPerk | undefined;
  onComplete: (success: boolean) => void;
}

/** The "Anti-Stall" engine calibration mini-game. Only mounted while a Lv.4 part is pulled
 * out of inventory and pending a result — unmounting on completion resets all of its local
 * state for free. Unlike a normal hold-and-release gauge, holding the pedal is always safe;
 * the engine only stalls at the instant you *release* while the needle is outside the Green
 * Zone, which is what makes this "intense" rather than just another timing bar. */
function AntiStallCalibrationPanel({ partLevel, perk, onComplete }: AntiStallCalibrationPanelProps) {
  const tier = getPartTier(partLevel);
  const Icon = tier.icon;
  const { playRevSound, stopRevSound, playStallSound, setEnginePitch } = useEngineAudio();

  const [rpm, setRpm] = useState(0);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [stallFlash, setStallFlash] = useState(false);

  const hasResolvedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const handleReleaseRef = useRef<() => void>(() => {});

  // RPM is computed as a pure function of real elapsed wall-clock time since the current
  // hold/release phase began — NOT accumulated bit-by-bit every rAF frame. An accumulator
  // (`rpm += rate * frameDelta`) is fragile to how sparsely rAF actually fires: iOS Safari
  // can throttle it heavily during an active touch hold, so a small per-frame delta either
  // has to be uncapped (letting one huge catch-up delta teleport the value) or capped
  // (which then silently *undercounts* real elapsed time whenever frames are sparse, making
  // progress feel stuck instead of jumpy). Recomputing fresh from `performance.now()` every
  // time is correct regardless of how many — or how few — frames actually land.
  const isHoldingRef = useRef(false);
  const phaseStartTimeRef = useRef(performance.now());
  const phaseStartRpmRef = useRef(0);

  const getCurrentRpm = () => {
    const elapsedSeconds = (performance.now() - phaseStartTimeRef.current) / 1000;
    const rate = isHoldingRef.current
      ? ANTI_STALL.RPM_INCREASE_PER_SECOND
      : -ANTI_STALL.RPM_DECREASE_PER_SECOND;
    return Math.min(100, Math.max(0, phaseStartRpmRef.current + rate * elapsedSeconds));
  };

  // Calibration progress: total real time spent inside the Green Zone, summed across
  // separate in-zone stretches — same "compute from absolute time" reasoning as RPM above,
  // rather than accumulating a per-frame delta.
  const accumulatedInZoneMsRef = useRef(0);
  const zoneEnteredAtRef = useRef<number | null>(null);

  const getCurrentInZoneMs = (currentRpm: number, now: number) => {
    const inZone = currentRpm >= ANTI_STALL.TARGET_ZONE_MIN && currentRpm <= ANTI_STALL.TARGET_ZONE_MAX;
    if (inZone) {
      if (zoneEnteredAtRef.current === null) zoneEnteredAtRef.current = now;
      return accumulatedInZoneMsRef.current + (now - zoneEnteredAtRef.current);
    }
    if (zoneEnteredAtRef.current !== null) {
      accumulatedInZoneMsRef.current += now - zoneEnteredAtRef.current;
      zoneEnteredAtRef.current = null;
    }
    return accumulatedInZoneMsRef.current;
  };

  useEffect(() => {
    const step = () => {
      const now = performance.now();
      const currentRpm = getCurrentRpm();
      setRpm(currentRpm);
      // The rev sample only ever plays while the pedal is held (see handlePressStart/
      // handleReleaseRef below), so pitch only needs updating for that same window.
      if (isHoldingRef.current) {
        setEnginePitch(currentRpm);
      }

      if (!hasResolvedRef.current) {
        const inZoneMs = getCurrentInZoneMs(currentRpm, now);
        const progress = Math.min(100, (inZoneMs / (ANTI_STALL.HOLD_SECONDS_TO_WIN * 1000)) * 100);
        setCalibrationProgress(progress);

        if (progress >= 100) {
          hasResolvedRef.current = true;
          stopRevSound();
          onComplete(true);
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The release handler is registered on `window` ONCE for the whole life of this
  // component (not re-added per press), and is itself idempotent — real touchscreens fire
  // both a `pointerup`/`pointercancel` AND a `touchend`/`touchcancel` for the same physical
  // release, so both must be safe to call back-to-back without double-processing.
  // `handleReleaseRef` always points at the latest closure so the listener never goes stale.
  useEffect(() => {
    handleReleaseRef.current = () => {
      if (!isHoldingRef.current) return; // already processed this release
      const rpmAtRelease = getCurrentRpm();
      phaseStartRpmRef.current = rpmAtRelease;
      phaseStartTimeRef.current = performance.now();
      isHoldingRef.current = false;
      setIsHolding(false);
      stopRevSound();

      if (hasResolvedRef.current) return;
      const inZone =
        rpmAtRelease >= ANTI_STALL.TARGET_ZONE_MIN && rpmAtRelease <= ANTI_STALL.TARGET_ZONE_MAX;
      if (!inZone) {
        // Releasing outside the Green Zone stalls the engine instantly — this is the
        // entire "catch" of Anti-Stall calibration.
        hasResolvedRef.current = true;
        playStallSound();
        setStallFlash(true);
        window.setTimeout(() => onComplete(false), 400);
      }
    };
  });

  useEffect(() => {
    const release = () => handleReleaseRef.current();
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('touchend', release);
      window.removeEventListener('touchcancel', release);
    };
  }, []);

  // Shared by onPointerDown and onTouchStart — guarded by isHoldingRef so a real touch
  // device firing both events for the same press doesn't double-trigger (e.g. double
  // restarting the rev sound).
  const handlePressStart = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (hasResolvedRef.current || isHoldingRef.current) return;
    // Freeze the current (correctly-computed) rpm as the new phase's starting point before
    // flipping isHoldingRef, so there's no discontinuity at the transition instant.
    phaseStartRpmRef.current = getCurrentRpm();
    phaseStartTimeRef.current = performance.now();
    isHoldingRef.current = true;
    setIsHolding(true);
    playRevSound();
  };

  // onPointerUp/Leave/Cancel all route through the same idempotent release logic (see the
  // effect above) — wiring all three directly to the element, in addition to the
  // window-level listeners, maximizes the chance that at least one fires on iOS Safari,
  // where native gesture handling (text-selection loupe, scroll-vs-tap arbitration) can
  // swallow individual events. Whichever fires first sets isHoldingRef.current = false
  // immediately; the rest are no-ops.
  const handleDirectRelease = () => {
    handleReleaseRef.current();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, height: 0 }}
      animate={{ opacity: 1, scale: 1, height: 'auto' }}
      exit={{ opacity: 0, scale: 0.95, height: 0 }}
      className="panel-cut relative overflow-hidden border border-neon-cyan/50 bg-bg-panel p-4"
    >
      <span className="pointer-events-none absolute right-2 top-1 select-none font-mono text-[8px] uppercase tracking-widest text-neon-cyan/50">
        Diag.Active
      </span>
      <AnimatePresence>
        {stallFlash && (
          <motion.div
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none fixed inset-0 z-40 bg-red-600"
          />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-center gap-2 font-mono text-sm text-neutral-300">
        <Icon className={`h-4 w-4 ${tier.glow}`} strokeWidth={2} />
        Calibrating {tier.name} (Lv.{partLevel})
      </div>
      <div className="mt-0.5 space-y-0.5 text-center font-mono text-xs text-neon-cyan/80">
        {perk && (
          <p>
            + {perk}: {PERK_DESCRIPTIONS[perk]}
          </p>
        )}
        <p>+ {Math.round(ECONOMY.CALIBRATION_SCRAP_PER_SECOND_GROWTH * 100)}% Scrap/sec (every successful install)</p>
      </div>

      <Tachometer rpm={rpm} zoneMin={ANTI_STALL.TARGET_ZONE_MIN} zoneMax={ANTI_STALL.TARGET_ZONE_MAX} />

      <p className="-mt-2 text-center font-mono text-xs text-neutral-600">
        RPM {Math.round(rpm)} · Green Zone {ANTI_STALL.TARGET_ZONE_MIN}–{ANTI_STALL.TARGET_ZONE_MAX}
      </p>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between font-mono text-xs text-neutral-500">
          <span>Calibration</span>
          <span className="tabular-nums">{Math.round(calibrationProgress)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden border border-neutral-800 bg-neutral-900">
          {/* Scaled via `transform`, not animated via `width` — width changes trigger
             layout, and iOS Safari can deprioritize (visually "freeze") layout-affecting
             repaints while a touch is actively held, which is almost certainly why this bar
             specifically stopped updating on iPhone even after the RPM/needle math (already
             on a transform-only path) was fixed. `transform-gpu` promotes this to its own
             compositor layer so it keeps updating independently of main-thread paint.
             Deliberately no CSS transition here (matches the Tachometer's needle, which also
             snaps instantly): `step()` already writes a fresh, time-correct value every rAF
             frame, so layering a 100ms eased transition on top just makes the bar chase a
             perpetually-stale target — worse the sparser rAF fires, which is exactly what
             made it look laggy on iOS. */}
          <div
            className="h-full w-full origin-left transform-gpu bg-neon-cyan shadow-[0_0_4px_rgba(0,240,255,0.8)]"
            style={{ transform: `scaleX(${calibrationProgress / 100})` }}
          />
        </div>
        <p className="mt-1 text-center text-xs text-red-400/80">
          Releasing outside the Green Zone stalls the engine — the part is lost back to
          inventory.
        </p>
      </div>

      <div className="mt-4 flex items-center justify-center">
        <motion.button
          type="button"
          onPointerDown={handlePressStart}
          onTouchStart={handlePressStart}
          onPointerUp={handleDirectRelease}
          onPointerLeave={handleDirectRelease}
          onPointerCancel={handleDirectRelease}
          onContextMenu={(event) => event.preventDefault()}
          animate={isHolding ? { scale: 1.05 } : { scale: [1, 1.04, 1] }}
          transition={
            isHolding
              ? { duration: 0.15 }
              : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          }
          style={{
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            touchAction: 'none',
          }}
          className="touch-none select-none outline-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] rounded-full border-2 border-neon-cyan bg-neon-cyan/10 px-10 py-4 font-display text-base font-bold tracking-wide text-neon-cyan shadow-[0_0_8px_rgba(0,240,255,0.7)] active:bg-neon-cyan/20"
        >
          GAS PEDAL
        </motion.button>
      </div>
    </motion.div>
  );
}
