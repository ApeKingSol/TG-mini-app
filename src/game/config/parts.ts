import { BatteryCharging, Cog, Cpu, Gem, type LucideIcon } from 'lucide-react';

export interface PartTier {
  name: string;
  icon: LucideIcon;
  /** Tailwind classes for border/background/text/glow, escalating in rarity. */
  colorClasses: string;
  glow: string;
}

/** Cosmetic tiers for the merge chain, keyed by part level (index 0 = level 1). Purely presentational — the store only tracks kind/level. */
export const PART_TIERS: PartTier[] = [
  {
    name: 'Scrap Metal',
    icon: Cog,
    colorClasses: 'border-neutral-500/60 bg-neutral-700/30 text-neutral-300',
    glow: 'drop-shadow-[0_0_6px_rgba(163,163,163,0.5)]',
  },
  {
    name: 'Basic Chip',
    icon: Cpu,
    colorClasses: 'border-green-400/60 bg-green-400/10 text-green-300',
    glow: 'drop-shadow-[0_0_6px_rgba(74,222,128,0.6)]',
  },
  {
    name: 'Plasma Battery',
    icon: BatteryCharging,
    colorClasses: 'border-blue-400/60 bg-blue-400/10 text-blue-300',
    glow: 'drop-shadow-[0_0_6px_rgba(96,165,250,0.6)]',
  },
  {
    name: 'Neon Core',
    icon: Gem,
    colorClasses: 'border-purple-400/60 bg-purple-400/10 text-purple-300',
    glow: 'drop-shadow-[0_0_6px_rgba(192,132,252,0.6)]',
  },
];

export function getPartTier(level: number): PartTier {
  return PART_TIERS[Math.min(level - 1, PART_TIERS.length - 1)];
}

/** Assigned to a part once it reaches Max Level, and unlocked permanently when that part is
 * successfully calibrated on the car. */
export type PartPerk = 'EMP Charge' | 'Nitro Core' | 'Quantum Armor';

export const PART_PERKS: PartPerk[] = ['EMP Charge', 'Nitro Core', 'Quantum Armor'];

export const PERK_DESCRIPTIONS: Record<PartPerk, string> = {
  'EMP Charge': '+5% permanent Tap Crit Chance',
  'Nitro Core': '+5.0 permanent Scrap/sec',
  'Quantum Armor': '+50 permanent Max Car HP',
};

export function rollPartPerk(): PartPerk {
  return PART_PERKS[Math.floor(Math.random() * PART_PERKS.length)];
}
