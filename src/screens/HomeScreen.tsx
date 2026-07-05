import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gauge } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import { CALIBRATION } from '../game/config/economy';

function formatTimeLeft(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

export function HomeScreen() {
  const isBoostActive = useGameStore((state) => state.isBoostActive);
  const boostTimeLeft = useGameStore((state) => state.boostTimeLeft);
  const activateBoost = useGameStore((state) => state.activateBoost);

  // `power`/`calibrationProgress` are UI-only session state, not global store: leaving
  // this screen mid-calibration reasonably forfeits progress, same as leaving mid-race.
  const [power, setPower] = useState(0);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);

  // Refs mirror the state above so the rAF loop always reads the latest value instead of
  // a stale closure, and so the win check is a plain imperative read — not logic buried
  // inside a setState updater, which React/StrictMode may invoke more than once.
  const powerRef = useRef(0);
  const calibrationProgressRef = useRef(0);
  const isHoldingRef = useRef(false);
  const hasWonRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  const inTargetZone =
    power >= CALIBRATION.TARGET_ZONE_MIN && power <= CALIBRATION.TARGET_ZONE_MAX;
  const isOverheated = power > CALIBRATION.TARGET_ZONE_MAX;

  // Reset the mini-game whenever there's no active boost — covers both a fresh mount and
  // the moment a previous boost naturally expires while this screen stays mounted.
  useEffect(() => {
    if (isBoostActive) return;
    powerRef.current = 0;
    calibrationProgressRef.current = 0;
    hasWonRef.current = false;
    setPower(0);
    setCalibrationProgress(0);
  }, [isBoostActive]);

  const handleWin = () => {
    activateBoost(CALIBRATION.BOOST_DURATION_SECONDS);
    setShowSuccessFlash(true);
    window.setTimeout(() => setShowSuccessFlash(false), 3000);
  };

  // Drives the Power needle every animation frame while mounted; disabled entirely once
  // a boost is active, since the mini-game is "spent" until it expires.
  useEffect(() => {
    if (isBoostActive) return;

    const step = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) lastFrameTimeRef.current = timestamp;
      const deltaSeconds = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      const rate = isHoldingRef.current
        ? CALIBRATION.POWER_INCREASE_PER_SECOND
        : -CALIBRATION.POWER_DECREASE_PER_SECOND;
      powerRef.current = Math.min(100, Math.max(0, powerRef.current + rate * deltaSeconds));
      setPower(powerRef.current);

      if (!hasWonRef.current) {
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
            hasWonRef.current = true;
            handleWin();
          }
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastFrameTimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBoostActive]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some environments (older WebViews, certain iframe sandboxes) can throw here —
      // the hold still ends correctly via pointerup/pointercancel regardless.
    }
    isHoldingRef.current = true;
    setIsHolding(true);
  };

  const endHold = () => {
    isHoldingRef.current = false;
    setIsHolding(false);
  };

  const gaugeColorClass = isOverheated
    ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
    : inTargetZone
      ? 'bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]'
      : 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.8)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center gap-5 pt-4 text-center"
    >
      <div>
        <p className="font-display text-sm uppercase tracking-widest text-neutral-400">
          Dyno Stand
        </p>
        <p className="text-xs text-neutral-600">Core Calibration</p>
      </div>

      <motion.img
        src="/car-base.webp"
        alt="Cyber Car"
        animate={isOverheated ? { y: [0, -2, 2, 0] } : { y: [0, -6, 0] }}
        transition={
          isOverheated
            ? { duration: 0.15, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
        }
        className="mx-auto w-full max-w-sm object-contain drop-shadow-[0_0_15px_rgba(0,255,255,0.3)]"
      />

      <AnimatePresence mode="wait">
        {isBoostActive ? (
          <motion.div
            key="boost-active"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-xs rounded-xl border border-green-500/40 bg-green-500/5 p-5"
          >
            <p className="font-display text-lg font-bold text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.7)]">
              CORE OVERCLOCKED
            </p>
            <p className="mt-1 text-sm text-neutral-400">
              2x passive Scrap generation active
            </p>
            <p className="mt-3 font-display text-2xl font-bold text-neon-cyan tabular-nums">
              {formatTimeLeft(boostTimeLeft)}
            </p>
            <p className="text-xs text-neutral-500">remaining</p>
          </motion.div>
        ) : (
          <motion.div
            key="calibration-game"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex w-full max-w-xs flex-col items-center gap-4"
          >
            <div className="w-full rounded-xl border border-neutral-800 bg-bg-panel p-4">
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

            <div className="w-full">
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

            <motion.button
              type="button"
              onPointerDown={handlePointerDown}
              onPointerUp={endHold}
              onPointerCancel={endHold}
              onLostPointerCapture={endHold}
              onContextMenu={(event) => event.preventDefault()}
              animate={isHolding ? { scale: 1.05 } : { scale: [1, 1.04, 1] }}
              transition={
                isHolding
                  ? { duration: 0.15 }
                  : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
              }
              className="touch-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] select-none rounded-full border-2 border-neon-cyan bg-neon-cyan/10 px-10 py-5 font-display text-lg font-bold tracking-wide text-neon-cyan shadow-[0_0_20px_rgba(0,240,255,0.5)] active:bg-neon-cyan/20"
            >
              CALIBRATE CORE
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSuccessFlash && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.9 }}
            className="fixed inset-x-4 top-4 z-50 rounded-xl border border-green-400/50 bg-bg-panel/95 px-4 py-3 text-center shadow-lg backdrop-blur"
          >
            <p className="font-display text-base font-extrabold tracking-wide text-green-400 drop-shadow-[0_0_12px_rgba(74,222,128,0.9)]">
              SYSTEM OVERCLOCKED
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
