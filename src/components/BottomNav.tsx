import { motion } from 'framer-motion';

export type ScreenId = 'junkyard' | 'garage' | 'race';

interface NavItem {
  id: ScreenId;
  label: string;
  iconSrc: string;
}

const SIDE_ITEMS: NavItem[] = [
  { id: 'junkyard', label: 'Scrapyard', iconSrc: '/icon-nav-scrapyard.jpg' },
  { id: 'race', label: 'The Streets', iconSrc: '/icon-nav-streets.jpg' },
];

const GARAGE_ICON_SRC = '/icon-nav-garage.jpg';

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
         backdrop-filter only blurs what's inside its own box, and the FAB below deliberately
         floats above this panel's top edge — keeping it a DOM sibling instead of a child means
         it renders as a crisp, unblurred badge breaking out of the glass, rather than getting
         blurred (or clipped, had this used overflow/clip-path instead) along with everything
         else in here. */}
      <div className="nav-glass relative">
        <div className="relative mx-auto flex max-w-md items-stretch px-2">
          <NavButton item={SIDE_ITEMS[0]} isActive={active === SIDE_ITEMS[0].id} onClick={onChange} />

          {/* Reserves the center column so the two side buttons stay symmetric; the actual
             Garage button is the absolutely-positioned FAB below, breaking out above the bar. */}
          <div className="flex-1" />

          <NavButton item={SIDE_ITEMS[1]} isActive={active === SIDE_ITEMS[1].id} onClick={onChange} />
        </div>
      </div>

      {/* Only the icon itself pokes above the glass panel's top edge (a fixed -18px, not a
         relative -50% of the whole label+underline stack) — enough to read as a floating
         primary action without the label/underline drifting up over the screen content
         behind the nav, and without the button overlapping content the way a full -50%
         offset of this taller (icon+label+underline) stack used to. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex -translate-y-[18px] justify-center">
        <div className="pointer-events-auto flex flex-col items-center justify-center gap-1">
          <motion.button
            type="button"
            onClick={() => onChange('garage')}
            whileTap={{ scale: 0.9 }}
            className="flex items-center justify-center"
          >
            {/* No button chrome (no metal circle, no border, no box-shadow) — same treatment
               as the side nav icons: a transparent container, all the emphasis coming from
               drop-shadow on the image itself, distinguished from the side icons only by
               being visibly larger. */}
            <img
              src={GARAGE_ICON_SRC}
              alt=""
              className={`glow-mask h-14 w-14 object-contain mix-blend-screen transition-all ${
                isGarageActive
                  ? 'opacity-100 drop-shadow-[0_0_10px_rgba(0,240,255,0.9)]'
                  : 'opacity-50 grayscale'
              }`}
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
    </nav>
  );
}

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  onClick: (id: ScreenId) => void;
}

function NavButton({ item, isActive, onClick }: NavButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={() => onClick(item.id)}
      whileTap={{ scale: 0.88 }}
      className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2"
    >
      <img
        src={item.iconSrc}
        alt=""
        className={`glow-mask h-8 w-8 object-contain mix-blend-screen transition-all ${
          isActive ? 'opacity-100 drop-shadow-[0_0_5px_rgba(0,240,255,0.85)]' : 'opacity-45 grayscale'
        }`}
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
