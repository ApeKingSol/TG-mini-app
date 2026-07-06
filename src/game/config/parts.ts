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
 * successfully calibrated on the car. There are exactly 3 — once all 3 are installed on a
 * car (`installedUpgrades.length === 3`), that car is "MASTERED" and ready for trade-in. */
export type PartPerk = 'Neuro-Optimizer' | 'Quantum Injector' | 'Syndicate Transponder';

export const PART_PERKS: PartPerk[] = [
  'Neuro-Optimizer',
  'Quantum Injector',
  'Syndicate Transponder',
];

export const PERK_DESCRIPTIONS: Record<PartPerk, string> = {
  'Neuro-Optimizer': '+5% permanent Tap Crit Chance',
  'Quantum Injector': '+5.0 permanent Scrap/sec',
  'Syndicate Transponder': '+50 permanent Max Car HP',
};

/** Rolls a perk, excluding any already installed or already sitting on another Lv.4 part —
 * with only 3 possible perks and exactly 3 upgrade slots per car, a duplicate would either
 * waste a calibration or make "MASTERED" unreachable. */
export function rollPartPerk(excluding: PartPerk[] = []): PartPerk {
  const available = PART_PERKS.filter((perk) => !excluding.includes(perk));
  const pool = available.length > 0 ? available : PART_PERKS;
  return pool[Math.floor(Math.random() * pool.length)];
}
