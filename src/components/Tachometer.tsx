import { motion } from 'framer-motion';

const CENTER = 100;
const RADIUS = 82;
const STROKE_WIDTH = 16;

/** rpm 0-100 maps to a 180 (left, rpm 0) -> 0 (right, rpm 100) sweep through 90 (top). */
function rpmToAngle(rpm: number): number {
  return 180 - (rpm / 100) * 180;
}

function polarToCartesian(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(rad), y: CENTER - radius * Math.sin(rad) };
}

/** Traces the top semicircle between two rpm values — sweep-flag 1 is what makes this arc
 * bulge through the top rather than the bottom, verified visually while building this. */
function describeArc(fromRpm: number, toRpm: number, radius: number): string {
  const start = polarToCartesian(rpmToAngle(fromRpm), radius);
  const end = polarToCartesian(rpmToAngle(toRpm), radius);
  const largeArcFlag = Math.abs(rpmToAngle(fromRpm) - rpmToAngle(toRpm)) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

interface TachometerProps {
  rpm: number;
  zoneMin: number;
  zoneMax: number;
  /** Stroke color for both the target arc and the in-zone needle — defaults to the Anti-
   * Stall mini-game's green "Stable Zone" so existing callers don't need to change. Syndicate
   * Drag passes a blue tone for its "Blue Zone" so the two timing mini-games read as
   * visually distinct at a glance. */
  zoneColor?: string;
}

export function Tachometer({ rpm, zoneMin, zoneMax, zoneColor = '#4ade80' }: TachometerProps) {
  const clampedRpm = Math.min(100, Math.max(0, rpm));
  const inZone = clampedRpm >= zoneMin && clampedRpm <= zoneMax;
  const needleDeg = (clampedRpm / 100) * 180;

  return (
    <svg viewBox="0 0 200 110" className="mx-auto w-full max-w-[220px]">
      <path
        d={describeArc(0, 100, RADIUS)}
        fill="none"
        stroke="#27272a"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <path
        d={describeArc(zoneMax, 100, RADIUS)}
        fill="none"
        stroke="#7f1d1d"
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      <path
        d={describeArc(zoneMin, zoneMax, RADIUS)}
        fill="none"
        stroke={zoneColor}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
      />
      {/* Outer <g> carries the real RPM angle, driven imperatively every animation frame by
         the mini-game's rAF loop. Rotation uses the SVG `transform` ATTRIBUTE
         (`rotate(angle, cx, cy)`), not the CSS `transform`/`transform-origin` properties —
         CSS transforms on SVG elements are notoriously inconsistent about which coordinate
         space `transform-origin` resolves in across browsers, and on iOS Safari this made
         the pivot land somewhere far from the needle's actual center, so any real rotation
         looked like the needle snapping straight to one extreme or the other instead of
         sweeping smoothly. The SVG attribute form operates directly in the SVG's own user
         units with no such ambiguity. The inner motion.g layers a small continuous jitter
         on top via its own independent (CSS) transform, so it vibrates without fighting the
         outer element's per-frame rotation updates (same lesson as PartSlot's drag
         transform vs. Framer Motion pop animation). */}
      <g transform={`rotate(${needleDeg}, ${CENTER}, ${CENTER})`}>
        <motion.g
          animate={{ x: [-1.5, 1.5, -1, 1, 0], y: [1, -1, 0.5, -0.5, 0] }}
          transition={{ duration: 0.1, repeat: Infinity, ease: 'linear' }}
        >
          <line
            x1={CENTER}
            y1={CENTER}
            x2={CENTER - RADIUS + 8}
            y2={CENTER}
            stroke={inZone ? zoneColor : '#f87171'}
            strokeWidth={4}
            strokeLinecap="round"
          />
        </motion.g>
      </g>
      <circle cx={CENTER} cy={CENTER} r={7} fill="#e5e5e5" />
    </svg>
  );
}
