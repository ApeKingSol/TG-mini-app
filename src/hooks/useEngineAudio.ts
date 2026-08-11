import { useEffect, useRef } from 'react';

/** Playback rate at RPM 0 — a slow, struggling chug. */
const MIN_PLAYBACK_RATE = 0.7;
/** Playback rate at RPM 100 — a screaming high-rev. */
const MAX_PLAYBACK_RATE = 1.8;
/** Skip re-assigning `playbackRate` for changes smaller than this — writing it on every
 * single animation frame (even to a value it already has) risks tiny audible glitches in
 * some browsers' audio pipelines. */
const MIN_RATE_DELTA = 0.01;

/** Thin wrapper around two HTML5 Audio elements for the Anti-Stall mini-game: a looping rev
 * sound while the pedal is held, and a one-shot stall sound on failure. `.play()` rejections
 * (e.g. the asset isn't in `public/` yet, or autoplay is blocked) are swallowed rather than
 * thrown, since a missing sound effect shouldn't break the mini-game itself. */
export function useEngineAudio() {
  const revAudioRef = useRef<HTMLAudioElement | null>(null);
  const stallAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAppliedRateRef = useRef(1);

  useEffect(() => {
    const rev = new Audio('/engine-rev.mp3');
    rev.loop = true;
    revAudioRef.current = rev;

    const stall = new Audio('/engine-stall.mp3');
    stallAudioRef.current = stall;

    return () => {
      rev.pause();
      stall.pause();
    };
  }, []);

  const playRevSound = () => {
    const rev = revAudioRef.current;
    if (!rev) return;
    rev.currentTime = 0;
    rev.playbackRate = MIN_PLAYBACK_RATE;
    lastAppliedRateRef.current = MIN_PLAYBACK_RATE;
    rev.play().catch(() => {});
  };

  const stopRevSound = () => {
    const rev = revAudioRef.current;
    if (!rev) return;
    rev.pause();
    rev.currentTime = 0;
    rev.playbackRate = 1;
    lastAppliedRateRef.current = 1;
  };

  /** Maps 0-100 RPM linearly onto MIN_PLAYBACK_RATE..MAX_PLAYBACK_RATE, so the looping rev
   * sample actually sounds like it's climbing/falling with the needle instead of looping at
   * a fixed pitch the whole time. Meant to be called every rAF frame while the pedal is
   * held; the delta-threshold guard keeps that from spamming `playbackRate` writes. */
  const setEnginePitch = (rpm: number) => {
    const rev = revAudioRef.current;
    if (!rev) return;
    const clampedRpm = Math.min(100, Math.max(0, rpm));
    const rate =
      MIN_PLAYBACK_RATE + (clampedRpm / 100) * (MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE);
    if (Math.abs(rate - lastAppliedRateRef.current) < MIN_RATE_DELTA) return;
    rev.playbackRate = rate;
    lastAppliedRateRef.current = rate;
  };

  const playStallSound = () => {
    stopRevSound();
    const stall = stallAudioRef.current;
    if (!stall) return;
    stall.currentTime = 0;
    stall.play().catch(() => {});
  };

  return { playRevSound, stopRevSound, playStallSound, setEnginePitch };
}
