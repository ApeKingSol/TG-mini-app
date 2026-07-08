import type { PartPerk } from '../config/parts';

export interface CarState {
  id: string;
  name: string;
}

/** The 4-Core race-performance stats, derived from carTier + which of the 3 unique Garage
 * perks are installed — see getCarStats() in economy.ts. Not persisted; recomputed on demand
 * from state that already is. */
export interface CarStats {
  topSpeed: number;
  acceleration: number;
  durability: number;
  handling: number;
}

export interface Part {
  id: string;
  /** Merge level, starting at 1. Two parts of the same level merge into one of level + 1, up to MAX_PART_LEVEL. */
  level: number;
  name: string;
  /** Rolled once a part reaches Max Level; unlocked permanently when installed via Anti-Stall calibration. */
  perk?: PartPerk;
}

/** Which player stat a Junkyard upgrade increases. */
export type UpgradeEffect = 'scrapPerClick' | 'scrapPerSecond' | 'maxEnergy';

export interface Upgrade {
  id: string;
  name: string;
  /** Scrap cost of the next purchase; escalates each time this upgrade is bought. */
  cost: number;
  effect: UpgradeEffect;
  /** Added to the stat named by `effect` per unit owned. */
  boost: number;
  owned: number;
}

export interface PlayerState {
  scrap: number;
  neon: number;
  car: CarState;
  /** Which trade-in generation the current car is — starts at 1, +1 each successful trade-in. */
  carTier: number;
  /** Fixed-size 8-slot merge grid; `null` marks an empty socket. */
  inventory: (Part | null)[];
  /** How many parts have been bought via `buyPart` on the current car, driving the compound
   * cost ramp (basePrice * 1.15^partsPurchased). Starting parts don't count; resets to 0 on
   * trade-in. */
  partsPurchased: number;
  /** Energy (0-maxEnergy), spent exclusively on Garage merges. The Junkyard tap loop
   * neither consumes nor displays this. */
  energy: number;
  /** Cap for `energy`, raised permanently by the Junkyard's Expanded Battery upgrade. */
  maxEnergy: number;
  /** Unix ms timestamp of the last discrete +ENERGY_REGEN_AMOUNT tick (or store creation, if
   * none have fired yet) — used to compute both the next regen and the countdown shown next
   * to the Energy bar. Distinct from `lastSaved`, which updates every tick(), not just once
   * every 5 minutes. */
  lastEnergyRegenAt: number;
  /** The Lv.4 part currently pulled out of inventory and undergoing Anti-Stall calibration on the car, if any. */
  pendingCalibrationPart: Part | null;
  /** The perks already installed on the current car via successful calibration. Once its
   * length reaches getUpgradeRequirement(carTier) the car is "MASTERED" and ready to trade
   * in; resets to empty on trade-in. Only 3 distinct perks exist, so meeting a requirement
   * above 3 means installing a repeat. */
  installedUpgrades: PartPerk[];
  /** The Junkyard's always-visible upgrade list — a straightforward, repeatable Scrap sink
   * for incremental tap/passive gains, separate from the Garage's perk system. */
  upgrades: Upgrade[];
  scrapPerClick: number;
  scrapPerSecond: number;
  /** Chance (0–1) that a tap is a critical hit, awarding scrapPerClick * critMultiplier instead. */
  critChance: number;
  critMultiplier: number;
  /** Scrap awarded for time elapsed while the app was closed, shown once as a toast. Not persisted. */
  offlineEarnings: number | null;
  /** Unix ms timestamp of the last time state was brought current — drives both the live per-second tick and the offline-progress catch-up on reload. */
  lastSaved: number;
}
