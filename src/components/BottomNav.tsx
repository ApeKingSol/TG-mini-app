import { motion } from 'framer-motion';
import { Flag, Trash2, Wrench, type LucideIcon } from 'lucide-react';

export type ScreenId = 'junkyard' | 'garage' | 'race';

interface NavItem {
  id: ScreenId;
  label: string;
  icon: LucideIcon;
}

const SIDE_ITEMS: NavItem[] = [
  { id: 'junkyard', label: 'Junkyard', icon: Trash2 },
  { id: 'race', label: 'Race', icon: Flag },
];

interface BottomNavProps {
  active: ScreenId;
  onChange: (screen: ScreenId) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const isGarageActive = active === 'garage';

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-800 bg-bg-panel/95 backdrop-blur"
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
              whileTap={{ scale: 0.92 }}
              animate={
                isGarageActive
                  ? { boxShadow: '0 0 26px 6px rgba(0,240,255,0.55)' }
                  : { boxShadow: '0 0 12px 2px rgba(0,240,255,0.18)' }
              }
              transition={{ duration: 0.25 }}
              className={`relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] bg-gradient-to-b from-neutral-600 via-neutral-800 to-black shadow-[inset_0_2px_3px_rgba(255,255,255,0.2),inset_0_-3px_6px_rgba(0,0,0,0.6)] ${
                isGarageActive ? 'border-neon-cyan/80' : 'border-neutral-500/70'
              }`}
            >
              <span className="absolute inset-[3px] rounded-full border border-black/40" />
              <Wrench
                size={28}
                strokeWidth={2}
                className={
                  isGarageActive
                    ? 'text-neon-cyan drop-shadow-[0_0_8px_rgba(0,240,255,0.9)]'
                    : 'text-neutral-300'
                }
              />
            </motion.button>
            <span
              className={`text-xs font-semibold tracking-wide ${
                isGarageActive ? 'text-neon-cyan' : 'text-neutral-500'
              }`}
            >
              Garage
            </span>
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
  const Icon = item.icon;
  return (
    <motion.button
      type="button"
      onClick={() => onClick(item.id)}
      whileTap={{ scale: 0.9 }}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
        isActive ? 'text-neon-cyan' : 'text-neutral-500'
      }`}
    >
      <Icon
        className={isActive ? 'drop-shadow-[0_0_6px_rgba(0,240,255,0.7)]' : ''}
        size={20}
        strokeWidth={1.75}
      />
      {item.label}
    </motion.button>
  );
}
