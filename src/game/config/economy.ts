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
  /** Base Scrap cost to buy one new Level 1 part in the Garage, before the exponential ramp. */
  BUY_PART_COST_SCRAP: 15,
  /** Each part bought multiplies the next one's cost by this factor, so buying parts stays
   * a real Scrap sink instead of trivially stockpiling merge fodder late-game. */
  PART_BUY_COST_MULTIPLIER: 1.12,

  /** Max value of Energy — used exclusively by the Garage merge grid. The Junkyard's tap
   * loop doesn't touch this at all; taps are free. */
  MAX_ENERGY: 1000,
  /** Added to Energy per second. Deliberately slow relative to the 50-per-merge cost, so
   * merging stays a deliberate, rate-limited action rather than something to spam. */
  ENERGY_REGEN_PER_SECOND: 1,
  /** Energy spent per merge attempt. */
  MERGE_ENERGY_COST: 50,
  /** Chance (0-1) a merge crits, jumping the result an extra tier above normal. */
  MERGE_CRIT_CHANCE: 0.05,

  /** Quantum Injector perk: permanent scrapPerSecond granted on a successful install. */
  QUANTUM_INJECTOR_SCRAP_PER_SECOND: 5.0,
  /** Neuro-Optimizer perk: permanent boost to tap critChance on a successful install. */
  NEURO_OPTIMIZER_CRIT_CHANCE_BOOST: 0.05,
  /** Syndicate Transponder perk: permanent boost to the car's max HP (and an equal heal) on install. */
  SYNDICATE_TRANSPONDER_MAX_HP_BOOST: 50,

  /** Chance (0-1) that a tap lands as a critical hit. */
  STARTING_CRIT_CHANCE: 0.1,
  /** Critical taps award scrapPerClick multiplied by this. */
  STARTING_CRIT_MULTIPLIER: 3,

  /** Offline progress is capped at this many seconds, so a very stale save (or a fiddled system clock) can't award an absurd amount. */
  MAX_OFFLINE_SECONDS: 8 * 60 * 60,
  /** Below this many Scrap, the "Welcome back" toast doesn't bother showing. */
  MIN_OFFLINE_EARNINGS_TO_SHOW: 1,
} as const;

/** Cost of the Nth part bought (0-indexed), after the exponential ramp. */
export function getPartBuyCost(totalPartsBought: number): number {
  return Math.round(
    ECONOMY.BUY_PART_COST_SCRAP * ECONOMY.PART_BUY_COST_MULTIPLIER ** totalPartsBought,
  );
}

/** Tuning for the Garage's "Anti-Stall" engine calibration mini-game. */
export const ANTI_STALL = {
  TARGET_ZONE_MIN: 65,
  TARGET_ZONE_MAX: 85,
  /** Cumulative seconds the RPM needle must sit inside the Stable Green Zone to win. */
  HOLD_SECONDS_TO_WIN: 5,
  /** How fast RPM (0-100) climbs per second while the pedal is held. Deliberately gentler
   * than the zone is narrow, since releasing outside the zone is now an instant fail rather
   * than just losing progress — the physics need to leave room to react. */
  RPM_INCREASE_PER_SECOND: 35,
  /** How fast RPM falls per second once the pedal is released (and hasn't stalled). */
  RPM_DECREASE_PER_SECOND: 25,
  /** Caps the per-frame deltaSeconds fed into the RPM calculation. iOS Safari can briefly
   * pause rAF while it decides whether a touch is a tap/scroll/gesture; without this cap,
   * the next frame's huge delta would teleport the needle straight to 0 or 100 instead of
   * moving smoothly. */
  MAX_FRAME_DELTA_SECONDS: 0.1,
} as const;

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
