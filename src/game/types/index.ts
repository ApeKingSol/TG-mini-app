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
}

/** Which player stat an upgrade purchase increases. */
export type UpgradeEffect = 'scrapPerSecond' | 'scrapPerClick' | 'maxEnergy';

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
  /** Fixed-size 8-slot merge grid; `null` marks an empty socket. */
  inventory: (Part | null)[];
  /** The Lv.4 part currently pulled out of inventory and undergoing Core Calibration on the Dyno, if any. */
  pendingCalibrationPart: Part | null;
  scrapPerClick: number;
  scrapPerSecond: number;
  upgrades: Upgrade[];
  maxEnergy: number;
  currentEnergy: number;
  /** Added to currentEnergy per second, applied in the same tick as passive Scrap. */
  energyRegenRate: number;
  /** Chance (0–1) that a tap is a critical hit, awarding scrapPerClick * critMultiplier instead. */
  critChance: number;
  critMultiplier: number;
  /** Scrap awarded for time elapsed while the app was closed, shown once as a toast. Not persisted. */
  offlineEarnings: number | null;
  /** Unix ms timestamp of the last time state was brought current — drives both the live per-second tick and the offline-progress catch-up on reload. */
  lastSaved: number;
}
