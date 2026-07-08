import type { PartPerk } from './parts';
import type { CarStats } from '../types';

/** Central tuning knobs for the idle economy. Balance changes should happen here, not in the store logic. */
export const ECONOMY = {
  /** Starting scrapPerSecond, before any upgrades are purchased. */
  STARTING_SCRAP_PER_SECOND: 0.5,
  /** Starting scrapPerClick; nothing in this iteration upgrades it further. */
  STARTING_SCRAP_PER_CLICK: 1,
  /** Minimum ms between passive-generation ticks, to avoid re-rendering on every animation frame. */
  TICK_INTERVAL_MS: 1000,
  STARTING_SCRAP: 100,
  /** Enough for 5 Syndicate Drag bets right out of the gate, so the Race Hub's premium-
   * currency mode isn't dead on arrival for a brand-new save. */
  STARTING_NEON: 50,

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
  /** Every successful Anti-Stall calibration grants this much scrapPerSecond regardless of
   * which perk was rolled — on top of that perk's own specific effect (if any). */
  CALIBRATION_SCRAP_PER_SECOND_BOOST: 5,
  /** A successful trade-in grants this much scrapPerSecond, on top of whatever the car's 3
   * installed perks already contributed — the economy-wide payoff for reaching MASTERED. */
  TRADE_IN_SCRAP_PER_SECOND_BOOST: 15,

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
  /** The Profile screen's History tab only ever shows this many of the most recent $NEON
   * transactions — old entries just fall off the end rather than growing the save forever. */
  NEON_HISTORY_MAX_ENTRIES: 50,
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

/** Tuning for the Race Hub's 4-Core car performance stats. */
export const CAR_STATS = {
  BASE_STAT: 100,
  /** Every stat's base rises by this much per car tier, so trading in for a new car pays
   * off on the track too, not just in the Junkyard/Garage economies. */
  STAT_PER_TIER: 10,
  /** Flat boost each of the 3 unique Garage perks grants to its mapped stat(s) — see
   * getCarStats() below for the perk-to-stat mapping. */
  PERK_STAT_BOOST: 50,
} as const;

/** Derives the 4-Core race stats from the car's tier and which of the 3 unique Garage perks
 * are installed. Perks are de-duplicated via Set before mapping — a car whose upgrade
 * requirement exceeds 3 (see getUpgradeRequirement) installs *repeats* of the same 3 perks,
 * and those repeats already pay off in the Junkyard/Garage economies (extra scrapPerSecond,
 * critChance, ...); letting them *also* stack race stats would let one perk type dominate
 * every stat instead of the intended one-perk-one-stat spread. */
export function getCarStats(carTier: number, installedUpgrades: PartPerk[]): CarStats {
  const perks = new Set(installedUpgrades);
  const base = CAR_STATS.BASE_STAT + (carTier - 1) * CAR_STATS.STAT_PER_TIER;
  const boost = CAR_STATS.PERK_STAT_BOOST;
  return {
    topSpeed: base + (perks.has('Neuro-Optimizer') ? boost : 0),
    acceleration: base + (perks.has('Quantum Injector') ? boost : 0),
    durability: base + (perks.has('Syndicate Transponder') ? boost : 0),
    handling: base + (perks.has('Syndicate Transponder') ? boost : 0),
  };
}

/** Tuning for the Race Hub's "Syndicate Drag" mode: a timed-shift drag race against an AI
 * opponent, gated behind a $NEON bet the Syndicate takes a cut of. */
export const SYNDICATE_DRAG = {
  BET_NEON: 10,
  /** Gross payout on a win is 20 NEON (a straight double-up); the Syndicate's 10% commission
   * on that pot brings it down to 18 — a net +8 NEON profit over the bet already paid. */
  WIN_PAYOUT_NEON: 18,
  /** Engine damage for tapping SHIFT while the needle is outside the Blue Zone. */
  MISSED_SHIFT_DAMAGE: 35,
  /** Full 0->100->0 needle sweep duration — fast enough that landing a shift feels like a
   * real timing skill, not a slow-motion gimme. */
  NEEDLE_SWEEP_SECONDS: 1.6,
  /** Blue Zone width (needle percentage points) at the 100-baseline Acceleration stat. */
  BASE_ZONE_WIDTH: 14,
  /** Extra Blue Zone width per Acceleration point above the 100 baseline. */
  ZONE_WIDTH_PER_ACCELERATION: 0.3,
  /** The Blue Zone is always centered here; only its width scales with Acceleration. */
  ZONE_CENTER: 72,
  /** Race progress (0-100) gained per successfully-timed shift at the 100-baseline TopSpeed. */
  BASE_PROGRESS_PER_SHIFT: 14,
  /** Extra progress per shift, per TopSpeed point above the 100 baseline. */
  PROGRESS_PER_SHIFT_PER_TOP_SPEED: 0.12,
  /** The AI opponent's constant progress-per-second fill rate — tuned to be beatable by
   * consistently-landed shifts, not a guaranteed win either way. */
  AI_PROGRESS_PER_SECOND: 9,
} as const;
