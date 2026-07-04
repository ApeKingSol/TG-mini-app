import { motion } from 'framer-motion';
import { Flag, Gauge, Trash2, Wrench, type LucideIcon } from 'lucide-react';

export type ScreenId = 'home' | 'junkyard' | 'garage' | 'race';

interface NavItem {
  id: ScreenId;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Gauge },
  { id: 'junkyard', label: 'Junkyard', icon: Trash2 },
  { id: 'garage', label: 'Garage', icon: Wrench },
  { id: 'race', label: 'Race', icon: Flag },
];

interface BottomNavProps {
  active: ScreenId;
  onChange: (screen: ScreenId) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-800 bg-bg-panel/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-md">
        {NAV_ITEMS.map((item) => {
          const isActive = item.id === active;
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
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
        })}
      </div>
    </nav>
  );
}
