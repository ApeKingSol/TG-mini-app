import { useEffect, useRef } from 'react';

/** Thin wrapper around two HTML5 Audio elements for the Anti-Stall mini-game: a looping rev
 * sound while the pedal is held, and a one-shot stall sound on failure. `.play()` rejections
 * (e.g. the asset isn't in `public/` yet, or autoplay is blocked) are swallowed rather than
 * thrown, since a missing sound effect shouldn't break the mini-game itself. */
export function useEngineAudio() {
  const revAudioRef = useRef<HTMLAudioElement | null>(null);
  const stallAudioRef = useRef<HTMLAudioElement | null>(null);

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
    rev.play().catch(() => {});
  };

  const stopRevSound = () => {
    const rev = revAudioRef.current;
    if (!rev) return;
    rev.pause();
    rev.currentTime = 0;
  };

  const playStallSound = () => {
    stopRevSound();
    const stall = stallAudioRef.current;
    if (!stall) return;
    stall.currentTime = 0;
    stall.play().catch(() => {});
  };

  return { playRevSound, stopRevSound, playStallSound };
}
