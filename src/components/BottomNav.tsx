import { motion } from 'framer-motion';
import type { ReactElement, SVGProps } from 'react';

export type ScreenId = 'junkyard' | 'garage' | 'race';

/** Hand-drawn, stroke-based "neon schematic" icons — deliberately not a generic icon-set
 * glyph, so the nav reads as custom HUD chrome rather than a stock trash/wrench/flag set. */
type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

/** Scrapyard: a plain junk pile — jagged debris heap with a couple of scraps sticking out. */
const JunkPileIcon: IconComponent = (props) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <path
      d="M2.5 19.5 4.8 9.2l2.4 3 2.6-6 3 5.8 2.7-6.2 3 6.4 2.7-2 1.3 9.3z"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <path d="M2.5 19.5h19" strokeLinecap="round" />
    <path d="M8.5 19.5V16M13 19.5v-4.4M17 19.5v-3" strokeLinecap="round" opacity="0.6" />
  </svg>
);

/** Garage: a plain garage building — peaked roof over a door with panel lines. */
const GarageIcon: IconComponent = (props) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M3 11 12 4l9 7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4.5 10.3V20h15v-9.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 20v-7.5h9V20" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 15.7h9M7.5 17.8h9" strokeLinecap="round" />
  </svg>
);

/** The Streets: a digital speedometer — swept arc, tick marks, and a needle pinned hot. */
const SpeedometerIcon: IconComponent = (props) => (
  <svg viewBox="0 0 24 24" fill="none" {...props}>
    <path d="M4 16.5a8 8 0 1 1 16 0" strokeLinecap="round" />
    <path d="M6.5 16.5h.01M17.5 16.5h.01M9 10.3h.01M15 10.3h.01M12 8.5h.01" strokeLinecap="round" strokeWidth={2} />
    <path d="M12 16.5 16 11" strokeLinecap="round" strokeWidth={2} />
    <circle cx="12" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

interface NavItem {
  id: ScreenId;
  label: string;
  Icon: IconComponent;
}

const SIDE_ITEMS: NavItem[] = [
  { id: 'junkyard', label: 'Scrapyard', Icon: JunkPileIcon },
  { id: 'race', label: 'The Streets', Icon: SpeedometerIcon },
];

interface BottomNavProps {
  active: ScreenId;
  onChange: (screen: ScreenId) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const isGarageActive = active === 'garage';

  return (
    <nav
      className="nav-chamfer nav-metal fixed inset-x-0 bottom-0 z-10 border-t-2 border-neon-cyan/70 shadow-[0_-1px_0_rgba(255,255,255,0.08)_inset,0_-8px_24px_-8px_rgba(0,240,255,0.15)] backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="relative mx-auto flex max-w-md items-stretch">
        <NavButton item={SIDE_ITEMS[0]} isActive={active === SIDE_ITEMS[0].id} onClick={onChange} />

        {/* Reserves the center column so the two side buttons stay symmetric; the actual
           Garage button is the absolutely-positioned FAB below, breaking out above the bar. */}
        <div className="flex-1" />

        <NavButton item={SIDE_ITEMS[1]} isActive={active === SIDE_ITEMS[1].id} onClick={onChange} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
          <div className="pointer-events-auto flex -translate-y-1/2 flex-col items-center gap-1">
            <motion.button
              type="button"
              onClick={() => onChange('garage')}
              whileTap={{ scale: 0.9 }}
              animate={
                isGarageActive
                  ? { boxShadow: '0 0 10px 2px rgba(0,240,255,0.65), 0 0 22px 6px rgba(0,240,255,0.3)' }
                  : { boxShadow: '0 0 6px 1px rgba(0,240,255,0.15)' }
              }
              transition={{ duration: 0.2 }}
              className={`relative flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] bg-gradient-to-b from-neutral-600 via-neutral-800 to-black shadow-[inset_0_2px_3px_rgba(255,255,255,0.2),inset_0_-3px_6px_rgba(0,0,0,0.6)] ${
                isGarageActive ? 'border-neon-cyan/80' : 'border-neutral-500/70'
              }`}
            >
              <span className="absolute inset-[3px] rounded-full border border-black/40" />
              <GarageIcon
                className={`h-6 w-6 transition-opacity ${
                  isGarageActive
                    ? 'text-neon-cyan opacity-100 drop-shadow-[0_0_5px_rgba(0,240,255,0.95)]'
                    : 'text-neutral-400 opacity-50'
                }`}
                stroke="currentColor"
                strokeWidth={1.6}
              />
            </motion.button>
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-widest transition-all ${
                isGarageActive
                  ? 'text-neon-cyan opacity-100 [text-shadow:0_0_6px_rgba(0,240,255,0.85)]'
                  : 'text-neutral-500 opacity-50'
              }`}
            >
              Garage
            </span>
            <span
              className={`h-[2px] w-6 rounded-full bg-neon-cyan transition-opacity duration-200 ${
                isGarageActive ? 'opacity-90 shadow-[0_0_6px_rgba(0,240,255,0.9)]' : 'opacity-0'
              }`}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  onClick: (id: ScreenId) => void;
}

function NavButton({ item, isActive, onClick }: NavButtonProps) {
  const { Icon } = item;
  return (
    <motion.button
      type="button"
      onClick={() => onClick(item.id)}
      whileTap={{ scale: 0.88 }}
      className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2"
    >
      <Icon
        className={`h-5 w-5 transition-all ${
          isActive
            ? 'text-neon-cyan opacity-100 drop-shadow-[0_0_5px_rgba(0,240,255,0.9)]'
            : 'text-neutral-500 opacity-45'
        }`}
        stroke="currentColor"
        strokeWidth={1.6}
      />
      <span
        className={`font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
          isActive
            ? 'text-neon-cyan opacity-100 [text-shadow:0_0_6px_rgba(0,240,255,0.85)]'
            : 'text-neutral-500 opacity-45'
        }`}
      >
        {item.label}
      </span>
      <span
        className={`h-[2px] w-5 rounded-full bg-neon-cyan transition-opacity duration-200 ${
          isActive ? 'opacity-90 shadow-[0_0_6px_rgba(0,240,255,0.9)]' : 'opacity-0'
        }`}
      />
    </motion.button>
  );
}
