import type { PartPerk } from '../config/parts';

/** Car durability expressed as a 0–100 HP value, bucketed into a traffic-light status for UI. */
export type CarHpStatus = 'green' | 'yellow' | 'red';

export interface CarState {
  id: string;
  name: string;
  hp: number; // 0–100
  maxHp: number;
}

export interface Part {
  id: string;
  /** Merge level, starting at 1. Two parts of the same level merge into one of level + 1, up to MAX_PART_LEVEL. */
  level: number;
  name: string;
  /** Rolled once a part reaches Max Level; unlocked permanently when installed via Anti-Stall calibration. */
  perk?: PartPerk;
}

export interface PlayerState {
  scrap: number;
  neon: number;
  car: CarState;
  /** Which trade-in generation the current car is — starts at 1, +1 each successful trade-in. */
  carTier: number;
  /** Fixed-size 8-slot merge grid; `null` marks an empty socket. */
  inventory: (Part | null)[];
  /** How many parts have been bought via `buyPart`, driving the exponential cost ramp. Starting parts don't count. */
  totalPartsBought: number;
  /** Energy (0-MAX_ENERGY), spent exclusively on Garage merges. The Junkyard tap loop
   * neither consumes nor displays this. */
  energy: number;
  /** The Lv.4 part currently pulled out of inventory and undergoing Anti-Stall calibration on the car, if any. */
  pendingCalibrationPart: Part | null;
  /** The perks already installed on the current car via successful calibration — exactly 3
   * distinct values possible. Once all 3 are present the car is "MASTERED" and ready to
   * trade in; resets to empty on trade-in. */
  installedUpgrades: PartPerk[];
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
