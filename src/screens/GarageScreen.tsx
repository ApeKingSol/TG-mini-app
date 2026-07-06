import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
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
import { ECONOMY, ANTI_STALL, getPartBuyCost } from '../game/config/economy';
import { getPartTier, PERK_DESCRIPTIONS, type PartPerk } from '../game/config/parts';

const CAR_INSTALLATION_ZONE_ID = 'car-installation-zone';

export function GarageScreen() {
  const scrap = useGameStore((state) => state.scrap);
  const inventory = useGameStore((state) => state.inventory);
  const totalPartsBought = useGameStore((state) => state.totalPartsBought);
  const energy = useGameStore((state) => state.energy);
  const buyPart = useGameStore((state) => state.buyPart);
  const movePart = useGameStore((state) => state.movePart);
  const mergeParts = useGameStore((state) => state.mergeParts);
  const pendingCalibrationPart = useGameStore((state) => state.pendingCalibrationPart);
  const startCalibration = useGameStore((state) => state.startCalibration);
  const completeCalibration = useGameStore((state) => state.completeCalibration);

  const [justMergedId, setJustMergedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: 'error' | 'success' } | null>(
    null,
  );
  const partCost = getPartBuyCost(totalPartsBought);
  const canBuyPart = scrap >= partCost && inventory.some((slot) => slot === null);

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
      showToast(`Perk unlocked — ${perk}: ${PERK_DESCRIPTIONS[perk]}`, 'success');
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
        showToast(`Not enough Mechanic Focus to merge (-${ECONOMY.MERGE_ENERGY_COST}).`);
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <CarInstallationZone />

        <AnimatePresence>
          {pendingCalibrationPart && (
            <AntiStallCalibrationPanel
              partLevel={pendingCalibrationPart.level}
              perk={pendingCalibrationPart.perk}
              onComplete={handleCalibrationComplete}
            />
          )}
        </AnimatePresence>

        <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest text-neutral-500">
              Merge Grid
            </p>
            <motion.button
              type="button"
              onClick={buyPart}
              disabled={!canBuyPart}
              whileHover={canBuyPart ? { scale: 1.05 } : undefined}
              whileTap={canBuyPart ? { scale: 0.95 } : undefined}
              className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              Buy Part (-{partCost})
            </motion.button>
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            Drag a part onto a matching part to merge it up a tier ({ECONOMY.MERGE_ENERGY_COST}{' '}
            Focus). Drag a Lv.{ECONOMY.MAX_PART_LEVEL} part onto the car to install it.
          </p>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-neon-magenta" strokeWidth={2} />
                Mechanic Focus
              </span>
              <span className="tabular-nums">
                {Math.floor(energy)} / {ECONOMY.MAX_MECHANIC_ENERGY}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-neon-magenta to-neon-cyan"
                animate={{ width: `${(energy / ECONOMY.MAX_MECHANIC_ENERGY) * 100}%` }}
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
      </DndContext>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            className={`fixed inset-x-4 top-4 z-50 rounded-xl border bg-bg-panel/95 px-4 py-3 text-center shadow-lg backdrop-blur ${
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
    </motion.div>
  );
}

function CarInstallationZone() {
  const { setNodeRef, isOver } = useDroppable({ id: CAR_INSTALLATION_ZONE_ID });

  return (
    // No background fill or box-shadow here on purpose: a `drop-shadow`/`shadow-*` glow
    // traces the image's alpha silhouette, and its blur bleeds into the car art's own
    // transparent gaps (e.g. between the wheels and undercarriage), reading as a muddy
    // halo baked into the vehicle rather than a shadow behind it. The border alone gives
    // drop-zone feedback without touching anything inside the car's silhouette.
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-4 transition-colors ${
        isOver ? 'border-neon-cyan/70' : 'border-neutral-800'
      }`}
    >
      <motion.img
        src="/car-base.webp"
        alt="Cyber Car"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="mx-auto w-full max-w-sm object-contain"
      />
    </div>
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
  const { playRevSound, stopRevSound, playStallSound } = useEngineAudio();

  const [rpm, setRpm] = useState(0);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [stallFlash, setStallFlash] = useState(false);

  const rpmRef = useRef(0);
  const calibrationProgressRef = useRef(0);
  const isHoldingRef = useRef(false);
  const hasResolvedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const releaseListenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const step = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) lastFrameTimeRef.current = timestamp;
      const deltaSeconds = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      const rate = isHoldingRef.current
        ? ANTI_STALL.RPM_INCREASE_PER_SECOND
        : -ANTI_STALL.RPM_DECREASE_PER_SECOND;
      rpmRef.current = Math.min(100, Math.max(0, rpmRef.current + rate * deltaSeconds));
      setRpm(rpmRef.current);

      if (!hasResolvedRef.current) {
        const inZone =
          rpmRef.current >= ANTI_STALL.TARGET_ZONE_MIN &&
          rpmRef.current <= ANTI_STALL.TARGET_ZONE_MAX;
        if (inZone) {
          const progressPerSecond = 100 / ANTI_STALL.HOLD_SECONDS_TO_WIN;
          calibrationProgressRef.current = Math.min(
            100,
            calibrationProgressRef.current + progressPerSecond * deltaSeconds,
          );
          setCalibrationProgress(calibrationProgressRef.current);

          if (calibrationProgressRef.current >= 100) {
            hasResolvedRef.current = true;
            stopRevSound();
            onComplete(true);
          }
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (releaseListenerRef.current) {
        window.removeEventListener('pointerup', releaseListenerRef.current);
        window.removeEventListener('pointercancel', releaseListenerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release detection is deliberately NOT based on pointer capture / pointerleave: both
  // fire (or fail to fire) based on the pointer's physical position relative to the
  // button's live bounds, which shift every frame because the button scales while held.
  // A window-level listener sidesteps that entirely — "did the pointer go up anywhere on
  // the page" is unambiguous and identical across desktop, Android, and iOS.
  const handlePointerDown = () => {
    if (hasResolvedRef.current) return;
    isHoldingRef.current = true;
    setIsHolding(true);
    playRevSound();

    const release = () => {
      isHoldingRef.current = false;
      setIsHolding(false);
      stopRevSound();
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      releaseListenerRef.current = null;

      if (hasResolvedRef.current) return;
      const inZone =
        rpmRef.current >= ANTI_STALL.TARGET_ZONE_MIN &&
        rpmRef.current <= ANTI_STALL.TARGET_ZONE_MAX;
      if (!inZone) {
        // Releasing outside the Green Zone stalls the engine instantly — this is the
        // entire "catch" of Anti-Stall calibration, so it fires the instant the pointer
        // lifts rather than waiting for the next animation frame.
        hasResolvedRef.current = true;
        playStallSound();
        setStallFlash(true);
        window.setTimeout(() => onComplete(false), 400);
      }
    };
    releaseListenerRef.current = release;
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, height: 0 }}
      animate={{ opacity: 1, scale: 1, height: 'auto' }}
      exit={{ opacity: 0, scale: 0.95, height: 0 }}
      className="relative overflow-hidden rounded-xl border border-neon-cyan/40 bg-bg-panel p-4"
    >
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

      <div className="flex items-center justify-center gap-2 text-sm text-neutral-300">
        <Icon className={`h-4 w-4 ${tier.glow}`} strokeWidth={2} />
        Calibrating {tier.name} (Lv.{partLevel})
      </div>
      {perk && (
        <p className="mt-0.5 text-center text-xs text-neon-cyan/80">
          Unlocks: {perk} — {PERK_DESCRIPTIONS[perk]}
        </p>
      )}

      <Tachometer rpm={rpm} zoneMin={ANTI_STALL.TARGET_ZONE_MIN} zoneMax={ANTI_STALL.TARGET_ZONE_MAX} />

      <p className="-mt-2 text-center text-xs text-neutral-600">
        RPM {Math.round(rpm)} · Green Zone {ANTI_STALL.TARGET_ZONE_MIN}–{ANTI_STALL.TARGET_ZONE_MAX}
      </p>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
          <span>Calibration</span>
          <span className="tabular-nums">{Math.round(calibrationProgress)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-neon-cyan shadow-[0_0_8px_rgba(0,240,255,0.6)] transition-[width] duration-100 ease-linear"
            style={{ width: `${calibrationProgress}%` }}
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
          onPointerDown={handlePointerDown}
          onContextMenu={(event) => event.preventDefault()}
          animate={isHolding ? { scale: 1.05 } : { scale: [1, 1.04, 1] }}
          transition={
            isHolding
              ? { duration: 0.15 }
              : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          }
          className="touch-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] select-none rounded-full border-2 border-neon-cyan bg-neon-cyan/10 px-10 py-4 font-display text-base font-bold tracking-wide text-neon-cyan shadow-[0_0_20px_rgba(0,240,255,0.5)] active:bg-neon-cyan/20"
        >
          GAS PEDAL
        </motion.button>
      </div>
    </motion.div>
  );
}
