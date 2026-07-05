/** Central tuning knobs for the idle economy. Balance changes should happen here, not in the store logic. */
export const ECONOMY = {
  /** Starting scrapPerSecond, before any upgrades are purchased. */
  STARTING_SCRAP_PER_SECOND: 0.5,
  /** Starting scrapPerClick; nothing in this iteration upgrades it further. */
  STARTING_SCRAP_PER_CLICK: 1,
  /** Minimum ms between passive-generation ticks, to avoid re-rendering on every animation frame. */
  TICK_INTERVAL_MS: 1000,
  STARTING_SCRAP: 100,
  STARTING_NEON: 0,
  STARTING_CAR_MAX_HP: 100,

  /** Scrap cost to repair one point of car HP in the Garage. */
  REPAIR_COST_PER_HP: 2,

  /** How many of the 8 inventory slots start filled with a Level 1 part, so there's something to merge right away. */
  STARTING_PARTS_COUNT: 4,
  /** Fixed size of the Garage merge grid. */
  INVENTORY_SIZE: 8,
  /** Parts merge from Lv.1 up to this level, at which point they're ready to install on the car. */
  MAX_PART_LEVEL: 4,
  /** Scrap cost to buy one new Level 1 part in the Garage. */
  BUY_PART_COST_SCRAP: 15,
  /** Permanent scrapPerSecond granted for successfully calibrating a Lv.4 part on the Dyno. */
  CALIBRATION_SCRAP_PER_SECOND_REWARD: 5.0,

  /** Each upgrade purchase multiplies its own next cost by this factor. */
  UPGRADE_COST_MULTIPLIER: 1.15,

  STARTING_MAX_ENERGY: 1000,
  ENERGY_COST_PER_TAP: 1,
  /** Added to currentEnergy per second, same cadence as passive Scrap. */
  ENERGY_REGEN_PER_SECOND: 5,

  /** Chance (0-1) that a tap lands as a critical hit. */
  STARTING_CRIT_CHANCE: 0.1,
  /** Critical taps award scrapPerClick multiplied by this. */
  STARTING_CRIT_MULTIPLIER: 3,

  /** Offline progress is capped at this many seconds, so a very stale save (or a fiddled system clock) can't award an absurd amount. */
  MAX_OFFLINE_SECONDS: 8 * 60 * 60,
  /** Below this many Scrap, the "Welcome back" toast doesn't bother showing. */
  MIN_OFFLINE_EARNINGS_TO_SHOW: 1,
} as const;

/** Tuning for the Garage's Dyno "Core Calibration" hold-and-release mini-game. */
export const CALIBRATION = {
  TARGET_ZONE_MIN: 60,
  TARGET_ZONE_MAX: 90,
  /** Cumulative seconds the power needle must sit inside the target zone to win. */
  HOLD_SECONDS_TO_WIN: 3,
  /** How fast Power (0-100) climbs per second while the button is held. Slower than the
   * original 70/s — at that rate the needle crossed the target zone in ~200ms, well under
   * human reaction time on a touchscreen and making the game feel broken rather than hard. */
  POWER_INCREASE_PER_SECOND: 40,
  /** How fast Power falls per second once released. */
  POWER_DECREASE_PER_SECOND: 30,
} as const;

/**
 * Starting blueprint for upgrades; the store seeds its `upgrades` array from this.
 * Kept to exactly 3 entries — one lever per playstyle (passive / active tap / energy pool) —
 * to keep the upgrade loop legible rather than a wall of redundant passive-income cards.
 */
export const UPGRADE_BLUEPRINTS = [
  { id: 'scrap-drone', name: 'Scrap Drone', baseCost: 25, effect: 'scrapPerSecond', boost: 0.2 },
  { id: 'plasma-multitool', name: 'Plasma Multi-tool', baseCost: 100, effect: 'scrapPerClick', boost: 1 },
  { id: 'expanded-battery', name: 'Expanded Battery', baseCost: 200, effect: 'maxEnergy', boost: 100 },
] as const;

/** Tuning for the Toll Roads race loop. */
export const RACE = {
  ENTRY_FEE_SCRAP: 20,
  DURATION_MS: 3000,
  REWARD_SCRAP: 60,
  DAMAGE_ON_LOSS: 25,
  /** Win chance before the car HP modifier is applied. */
  BASE_WIN_CHANCE: 0.5,
  /** Added to/subtracted from the base win chance depending on car HP status. */
  WIN_CHANCE_MODIFIER: {
    green: 0.3,
    yellow: 0,
    red: -0.25,
  },
} as const;
