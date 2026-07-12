import { motion } from 'framer-motion';
import type { ReactElement, SVGProps } from 'react';

export type ScreenId = 'junkyard' | 'garage' | 'race';

/** Hand-drawn, stroke-based "neon schematic" icons — deliberately not a generic icon-set
 * glyph, so the nav reads as custom HUD chrome rather than a stock trash/wrench/flag set.
 * Went back to these plain vector icons after two rounds of trying to clean up cropped
 * AI-generated sprite-sheet art (blend-mode hacks, then luminance/radial keying, then a
 * flood fill that leaked through the source art's own decoration) never fully got rid of a
 * visible background fragment — a vector icon has no background to begin with. */
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
      className="fixed left-4 right-4 z-10"
      style={{ bottom: 'max(24px, env(safe-area-inset-bottom))' }}
    >
      {/* The glass panel is a separate inner element, not the positioned `nav` itself:
         backdrop-filter only blurs what's inside its own box. Garage now sits inline with the
         other two items in this same flex row (it used to be an absolutely-positioned FAB
         breaking well above the panel — that read as disconnected from the bar rather than
         part of it), just a couple pixels taller so it still reads as the primary/central
         action without floating off on its own. */}
      <div className="nav-glass relative">
        <div className="relative mx-auto flex max-w-md items-stretch px-2">
          <NavButton item={SIDE_ITEMS[0]} isActive={active === SIDE_ITEMS[0].id} onClick={onChange} />
          <GarageNavButton isActive={isGarageActive} onClick={() => onChange('garage')} />
          <NavButton item={SIDE_ITEMS[1]} isActive={active === SIDE_ITEMS[1].id} onClick={onChange} />
        </div>
      </div>
    </nav>
  );
}

interface GarageNavButtonProps {
  isActive: boolean;
  onClick: () => void;
}

/** The nav's primary/central item — same inline flex slot as the two side buttons (not an
 * absolutely-positioned FAB anymore), just visibly distinguished: a slightly bigger icon,
 * nudged up a few px so it barely crests the panel's top edge, and a persistent (not just
 * on-active) cyan glow so it still reads as "the main button" even on the other two tabs. */
function GarageNavButton({ isActive, onClick }: GarageNavButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2"
    >
      <GarageIcon
        className={`h-6 w-6 -translate-y-1.5 transition-all ${
          isActive
            ? 'text-neon-cyan opacity-100 drop-shadow-[0_0_9px_rgba(0,240,255,0.9)]'
            : 'text-neon-cyan/80 opacity-90 drop-shadow-[0_0_4px_rgba(0,240,255,0.55)]'
        }`}
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <span
        className={`font-mono text-[9px] font-bold uppercase tracking-widest transition-all ${
          isActive
            ? 'text-neon-cyan opacity-100 [text-shadow:0_0_6px_rgba(0,240,255,0.85)]'
            : 'text-neutral-500 opacity-45'
        }`}
      >
        Garage
      </span>
      <span
        className={`h-[2px] w-5 rounded-full bg-neon-cyan transition-opacity duration-200 ${
          isActive ? 'opacity-90 shadow-[0_0_6px_rgba(0,240,255,0.9)]' : 'opacity-0'
        }`}
      />
    </motion.button>
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
