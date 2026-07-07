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
  /** Base Scrap cost to buy a part on Tier 1, before the per-purchase compound ramp. */
  BUY_PART_COST_SCRAP: 15,
  /** Each car tier's base part price is this many times the previous tier's — the
   * standard idle-game move of scaling the whole economy up at every prestige step, not
   * just letting a single car's price ramp run forever. */
  BUY_PART_COST_TIER_MULTIPLIER: 10,
  /** Each part bought within the current car's lifetime multiplies the next one's cost by
   * this factor — the standard compound-growth idle-game curve. */
  PART_BUY_COST_MULTIPLIER: 1.15,

  /** Starting max value of Energy, before any Expanded Battery upgrades — used exclusively
   * by the Garage merge grid. The Junkyard's tap loop doesn't touch this at all; taps are
   * free. */
  STARTING_MAX_ENERGY: 1000,
  /** Energy is granted in this lump sum... */
  ENERGY_REGEN_AMOUNT: 25,
  /** ...once every this many seconds, rather than trickling in continuously — a discrete
   * "refill" players can watch count down, like a mobile game's energy timer. */
  ENERGY_REGEN_INTERVAL_SECONDS: 5 * 60,
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

  /** Each Junkyard upgrade purchase multiplies that upgrade's own next cost by this factor. */
  UPGRADE_COST_MULTIPLIER: 1.15,
} as const;

/**
 * Starting blueprint for the Junkyard's always-visible upgrade list; the store seeds its
 * `upgrades` array from this. Separate from the Garage's perk system — this is a
 * straightforward, repeatable Scrap sink for incremental tap/passive gains.
 */
export const UPGRADE_BLUEPRINTS = [
  { id: 'rusty-clicker', name: 'Rusty Clicker', baseCost: 25, effect: 'scrapPerClick', boost: 1 },
  { id: 'auto-scrapper', name: 'Auto-Scrapper', baseCost: 50, effect: 'scrapPerSecond', boost: 2 },
  { id: 'expanded-battery', name: 'Expanded Battery', baseCost: 200, effect: 'maxEnergy', boost: 200 },
] as const;

/** The starting price for a Lv.1 part on a given car tier, before that car's own
 * per-purchase ramp — Tier 1 is the base 15 Scrap, Tier 2 is 150, Tier 3 is 1,500, and so
 * on, ×10 per tier. */
export function getPartBasePrice(carTier: number): number {
  return ECONOMY.BUY_PART_COST_SCRAP * ECONOMY.BUY_PART_COST_TIER_MULTIPLIER ** (carTier - 1);
}

/** Standard idle-game compound growth: this tier's base price times 1.15^partsPurchased. */
export function getPartBuyCost(carTier: number, partsPurchased: number): number {
  return Math.floor(getPartBasePrice(carTier) * Math.pow(ECONOMY.PART_BUY_COST_MULTIPLIER, partsPurchased));
}

/** Seconds remaining until the next discrete Energy tick, for the Garage's countdown
 * readout. 0 once `energy` has already reached `maxEnergy` (nothing left to wait for). */
export function getSecondsUntilNextEnergyRegen(
  energy: number,
  maxEnergy: number,
  lastEnergyRegenAt: number,
  now: number,
): number {
  if (energy >= maxEnergy) return 0;
  const intervalMs = ECONOMY.ENERGY_REGEN_INTERVAL_SECONDS * 1000;
  const elapsedMs = now - lastEnergyRegenAt;
  const remainderMs = intervalMs - (elapsedMs % intervalMs);
  return Math.ceil(remainderMs / 1000);
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
