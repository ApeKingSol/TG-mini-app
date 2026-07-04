/** Car durability expressed as a 0–100 HP value, bucketed into a traffic-light status for UI. */
export type CarHpStatus = 'green' | 'yellow' | 'red';

export interface CarState {
  id: string;
  name: string;
  hp: number; // 0–100
  maxHp: number;
}

export type PartKind = 'gear';

export interface Part {
  id: string;
  kind: PartKind;
  /** Merge level, starting at 1. Two parts of the same kind and level merge into one of level + 1. */
  level: number;
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
  parts: Part[];
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
  /** True while a Core Calibration Overclock Boost is active (2x passive Scrap). */
  isBoostActive: boolean;
  /** Seconds remaining on the active boost; ticks down in real time, including while offline. */
  boostTimeLeft: number;
  /** Scrap awarded for time elapsed while the app was closed, shown once as a toast. Not persisted. */
  offlineEarnings: number | null;
  /** Unix ms timestamp of the last time state was brought current — drives both the live per-second tick and the offline-progress catch-up on reload. */
  lastSaved: number;
}
