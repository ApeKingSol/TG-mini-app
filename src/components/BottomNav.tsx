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
    <nav className="fixed inset-x-0 bottom-0 z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* The chamfered bar is a separate inner element, not the clip-path'd shape itself:
         clip-path clips descendant content to its own box, including anything a transform
         pushes outside it — the FAB below deliberately floats above this bar's top edge, so if
         it lived inside this div it would get silently sliced off along that top edge. */}
      <div className="nav-chamfer nav-metal relative border-t-2 border-neon-cyan/70 shadow-[0_-1px_0_rgba(255,255,255,0.08)_inset,0_-8px_24px_-8px_rgba(0,240,255,0.15)] backdrop-blur">
        <div className="relative mx-auto flex max-w-md items-stretch">
          <NavButton item={SIDE_ITEMS[0]} isActive={active === SIDE_ITEMS[0].id} onClick={onChange} />

          {/* Reserves the center column so the two side buttons stay symmetric; the actual
             Garage button is the absolutely-positioned FAB below, breaking out above the bar. */}
          <div className="flex-1" />

          <NavButton item={SIDE_ITEMS[1]} isActive={active === SIDE_ITEMS[1].id} onClick={onChange} />
        </div>
      </div>

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
            <img
              src={GARAGE_ICON_SRC}
              alt=""
              className={`h-9 w-9 object-contain transition-all ${
                isGarageActive
                  ? 'opacity-100 drop-shadow-[0_0_5px_rgba(0,240,255,0.85)]'
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
        className={`h-8 w-8 object-contain transition-all ${
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
