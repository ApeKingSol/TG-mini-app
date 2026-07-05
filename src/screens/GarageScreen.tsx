import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gauge } from 'lucide-react';
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
import { ECONOMY, CALIBRATION } from '../game/config/economy';
import { getPartTier } from '../game/config/parts';

const CAR_INSTALLATION_ZONE_ID = 'car-installation-zone';

export function GarageScreen() {
  const scrap = useGameStore((state) => state.scrap);
  const inventory = useGameStore((state) => state.inventory);
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
  const canBuyPart = scrap >= ECONOMY.BUY_PART_COST_SCRAP && inventory.some((slot) => slot === null);

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
    completeCalibration(success);
    if (success) {
      showToast(
        `Core calibrated — +${ECONOMY.CALIBRATION_SCRAP_PER_SECOND_REWARD.toFixed(1)}/sec permanently`,
        'success',
      );
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
      const merged = mergeParts(draggedIndex, targetIndex);
      if (merged) {
        setJustMergedId(merged.id);
        window.setTimeout(() => setJustMergedId(null), 500);
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
            <DynoCalibrationPanel
              partLevel={pendingCalibrationPart.level}
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
              Buy Part (-{ECONOMY.BUY_PART_COST_SCRAP})
            </motion.button>
          </div>
          <p className="mt-1 text-xs text-neutral-600">
            Drag a part onto a matching part to merge it up a tier. Drag a Lv.
            {ECONOMY.MAX_PART_LEVEL} part onto the car to install it.
          </p>

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
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-4 transition-colors ${
        isOver
          ? 'border-neon-cyan/70 bg-neon-cyan/5 shadow-[0_0_20px_rgba(0,240,255,0.3)]'
          : 'border-neutral-800 bg-bg-panel'
      }`}
    >
      <motion.img
        src="/car-base.webp"
        alt="Cyber Car"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="mx-auto w-full max-w-sm object-contain drop-shadow-[0_0_15px_rgba(0,255,255,0.3)]"
      />
    </div>
  );
}

interface DynoCalibrationPanelProps {
  partLevel: number;
  onComplete: (success: boolean) => void;
}

/** The Dyno's hold-and-release "Core Calibration" mini-game. Only mounted while a Lv.4
 * part is pulled out of inventory and pending a result — unmounting on completion resets
 * all of its local state for free. */
function DynoCalibrationPanel({ partLevel, onComplete }: DynoCalibrationPanelProps) {
  const tier = getPartTier(partLevel);
  const Icon = tier.icon;

  const [power, setPower] = useState(0);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);

  const powerRef = useRef(0);
  const calibrationProgressRef = useRef(0);
  const isHoldingRef = useRef(false);
  const hasResolvedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const releaseListenerRef = useRef<(() => void) | null>(null);

  const inTargetZone =
    power >= CALIBRATION.TARGET_ZONE_MIN && power <= CALIBRATION.TARGET_ZONE_MAX;
  const isOverheated = power > CALIBRATION.TARGET_ZONE_MAX;

  useEffect(() => {
    const step = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) lastFrameTimeRef.current = timestamp;
      const deltaSeconds = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      const rate = isHoldingRef.current
        ? CALIBRATION.POWER_INCREASE_PER_SECOND
        : -CALIBRATION.POWER_DECREASE_PER_SECOND;
      powerRef.current = Math.min(100, Math.max(0, powerRef.current + rate * deltaSeconds));
      setPower(powerRef.current);

      if (!hasResolvedRef.current) {
        const inZone =
          powerRef.current >= CALIBRATION.TARGET_ZONE_MIN &&
          powerRef.current <= CALIBRATION.TARGET_ZONE_MAX;
        if (inZone) {
          const progressPerSecond = 100 / CALIBRATION.HOLD_SECONDS_TO_WIN;
          calibrationProgressRef.current = Math.min(
            100,
            calibrationProgressRef.current + progressPerSecond * deltaSeconds,
          );
          setCalibrationProgress(calibrationProgressRef.current);

          if (calibrationProgressRef.current >= 100) {
            hasResolvedRef.current = true;
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
    isHoldingRef.current = true;
    setIsHolding(true);

    const release = () => {
      isHoldingRef.current = false;
      setIsHolding(false);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      releaseListenerRef.current = null;
    };
    releaseListenerRef.current = release;
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  };

  const handleCancel = () => {
    if (hasResolvedRef.current) return;
    hasResolvedRef.current = true;
    onComplete(false);
  };

  const gaugeColorClass = isOverheated
    ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
    : inTargetZone
      ? 'bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]'
      : 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.8)]';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, height: 0 }}
      animate={{ opacity: 1, scale: 1, height: 'auto' }}
      exit={{ opacity: 0, scale: 0.95, height: 0 }}
      className="overflow-hidden rounded-xl border border-neon-cyan/40 bg-bg-panel p-4"
    >
      <div className="flex items-center justify-center gap-2 text-sm text-neutral-300">
        <Icon className={`h-4 w-4 ${tier.glow}`} strokeWidth={2} />
        Calibrating {tier.name} (Lv.{partLevel})
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <Gauge className="h-3 w-3 text-neon-cyan" strokeWidth={2} />
            Engine Power
          </span>
          <span className="tabular-nums">{Math.round(power)} / 100</span>
        </div>
        <div className="relative h-5 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="absolute inset-y-0 border-x border-amber-400/60 bg-amber-400/25"
            style={{
              left: `${CALIBRATION.TARGET_ZONE_MIN}%`,
              width: `${CALIBRATION.TARGET_ZONE_MAX - CALIBRATION.TARGET_ZONE_MIN}%`,
            }}
          />
          <div
            className={`h-full rounded-full transition-[width] duration-100 ease-linear ${gaugeColorClass}`}
            style={{ width: `${power}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          Target zone: {CALIBRATION.TARGET_ZONE_MIN}–{CALIBRATION.TARGET_ZONE_MAX}
        </p>
      </div>

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
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
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
          className="touch-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] select-none rounded-full border-2 border-neon-cyan bg-neon-cyan/10 px-8 py-4 font-display text-base font-bold tracking-wide text-neon-cyan shadow-[0_0_20px_rgba(0,240,255,0.5)] active:bg-neon-cyan/20"
        >
          CALIBRATE CORE
        </motion.button>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-full border border-neutral-700 px-4 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
