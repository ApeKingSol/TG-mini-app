import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  className?: string;
}

/** Rolls smoothly from the previous value to the next instead of snapping, for passive-income ticks and reward payouts. */
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) =>
    Math.floor(latest).toLocaleString(),
  );

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.6,
      ease: 'easeOut',
    });
    return () => controls.stop();
  }, [value, motionValue]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
