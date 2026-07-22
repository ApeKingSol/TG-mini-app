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
  /** Enough for 5 Auto-Drag bets at the low tier right out of the gate, so the Race Hub's
   * premium-currency mode isn't dead on arrival for a brand-new save. */
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
   * just letting a single car's price ramp run forever. It compounds against
   * CALIBRATION_SCRAP_PER_SECOND_GROWTH / TRADE_IN_SCRAP_PER_SECOND_GROWTH below every tier
   * — those two need to roughly keep pace with this one for progression speed to stay
   * predictable as more tiers are added later, rather than compounding into a runaway wall.
   * See the getUpgradeRequirement doc in carTiers.ts for the other half of that balance (why
   * its growth is capped).
   *
   * Lowered from 3.5 to 1.8 (alongside PART_BUY_COST_MULTIPLIER below) when the roster grew
   * from 10 car tiers to 20 — the old 3.5x/tier rate was tuned for a 10-tier climb (Tier 10
   * in ~3 months for an always-available/"perfect" player); left unchanged across 20 tiers it
   * compounds twice as many times, pushing Tier 20 out to centuries. Re-tuned so that same
   * kind of player, simulated against the real store mechanics (buyPart/mergeParts/tradeInCar
   * math, fixed energy regen, capped install requirement), still can't clear Tier 20 in under
   * ~3 months (lands around ~105 days) — early tiers (1-8) still clear within a day each, so
   * the climb still opens easy and ramps up, it just no longer collapses to hours. */
  BUY_PART_COST_TIER_MULTIPLIER: 1.8,
  /** Each part bought within the current car's lifetime multiplies the next one's cost by
   * this factor — the standard compound-growth idle-game curve. Lowered from 1.18 to 1.13
   * alongside BUY_PART_COST_TIER_MULTIPLIER above, for the same reason. */
  PART_BUY_COST_MULTIPLIER: 1.13,

  /** Starting max value of Energy, before any Expanded Battery upgrades — used exclusively
   * by the Garage merge grid. The Junkyard's tap loop doesn't touch this at all; taps are
   * free. */
  STARTING_MAX_ENERGY: 1000,
  /** Energy granted per regen tick. Fixed — there used to be a Junkyard upgrade
   * (Energy Overclock) that let players buy this up without limit, which was exactly the
   * exploit that broke the Tier curve above; it's gone, and this is a plain constant again. */
  ENERGY_REGEN_AMOUNT: 25,
  /** ...once every this many seconds, rather than trickling in continuously — a discrete
   * "refill" players can watch count down, like a mobile game's energy timer. */
  ENERGY_REGEN_INTERVAL_SECONDS: 5 * 60,
  /** Energy spent per merge attempt. */
  MERGE_ENERGY_COST: 50,
  /** Chance (0-1) a merge crits, jumping the result an extra tier above normal. */
  MERGE_CRIT_CHANCE: 0.05,

  /** Quantum Injector perk: extra flat scrapPerSecond granted on a successful install, on
   * top of CALIBRATION_SCRAP_PER_SECOND_GROWTH below — small enough not to be the economy's
   * main income driver, just a differentiator between the 3 perks. */
  QUANTUM_INJECTOR_SCRAP_PER_SECOND: 5.0,
  /** Neuro-Optimizer perk: permanent boost to tap critChance on a successful install. */
  NEURO_OPTIMIZER_CRIT_CHANCE_BOOST: 0.05,
  /** Every successful Anti-Stall calibration multiplies scrapPerSecond by (1 + this),
   * regardless of which perk was rolled. Multiplicative (not the flat +5/sec this used to
   * be) so income keeps compounding at a rate comparable to BUY_PART_COST_TIER_MULTIPLIER as
   * the player advances — a flat bonus falls further behind every tier and is exactly what
   * made Tier 10 take centuries under the old numbers. */
  CALIBRATION_SCRAP_PER_SECOND_GROWTH: 0.03,
  /** A successful trade-in multiplies scrapPerSecond by (1 + this) — the bigger economy-wide
   * payoff for reaching MASTERED, on top of each calibration's own smaller compounding above.
   * Also multiplicative for the same reason. */
  TRADE_IN_SCRAP_PER_SECOND_GROWTH: 0.15,

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
 *
 * Costs and boosts are sized against the *current* early-game numbers (starting
 * scrapPerSecond 0.5, part prices in the tens of Scrap) rather than the old ones these
 * replaced (flat boosts that were sensible early but fell hopelessly behind the Garage's
 * compounding calibration/trade-in bonuses within a couple of tiers, per a real purchase-
 * simulation — a rational player never bought any of them). Kept flat (not %-based like the
 * Garage bonuses) deliberately: a %-based Junkyard bonus compounds against its own falling
 * cost-to-income ratio and creates a runaway feedback loop that trivializes the whole climb
 * in hours instead of months, also confirmed by simulation.
 */
export const UPGRADE_BLUEPRINTS = [
  { id: 'rusty-clicker', name: 'Rusty Clicker', baseCost: 25, effect: 'scrapPerClick', boost: 1 },
  { id: 'auto-scrapper', name: 'Auto-Scrapper', baseCost: 30, effect: 'scrapPerSecond', boost: 0.3 },
  { id: 'expanded-battery', name: 'Expanded Battery', baseCost: 80, effect: 'maxEnergy', boost: 150 },
] as const;

/** The starting price for a Lv.1 part on a given car tier, before that car's own
 * per-purchase ramp — Tier 1 is the base 15 Scrap, Tier 2 is 30, Tier 3 is 60, and so on,
 * ×BUY_PART_COST_TIER_MULTIPLIER per tier. */
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

/** Tuning for the Race Hub's "Auto-Drag" mode: a hands-off auto-battler — the player only
 * picks a bet tier, then both cars fill their progress bar from stats + random events, with
 * no timing input required. */
export const AUTO_DRAG = {
  /** Selectable bet tiers, kept modest (not the much bigger round numbers a bet-screen mockup
   * might suggest) so a fresh save (ECONOMY.STARTING_NEON: 50) can always afford the low
   * tier. */
  BET_TIERS: [10, 25, 50] as const,
  /** Gross payout on a win is this many times the bet (a straight double-up, before tax). */
  GROSS_WIN_MULTIPLIER: 2,
  /** The Syndicate's cut of the gross payout on a win — light, since there's no timing skill
   * here to reward, just the bet decision itself. */
  SYSTEM_TAX_RATE: 0.05,

  /** Race progress (0-100) filled per second at the 100-baseline Speed stat. Tuned so a
   * baseline-vs-baseline race (no launch jump, no random events) finishes in ~4.5s, the
   * middle of the intended 3-5s race length. */
  BASE_FILL_PER_SECOND: 22,
  /** Extra fill-per-second per Speed point above the 100 baseline. */
  FILL_PER_SECOND_PER_SPEED: 0.12,

  /** One-time progress jump applied the instant the race starts, at the 100-baseline Accel
   * stat — models "off the line" launch acceleration rather than top-end speed. */
  BASE_LAUNCH_JUMP: 6,
  /** Extra launch jump per Accel point above the 100 baseline. */
  LAUNCH_JUMP_PER_ACCEL: 0.1,

  /** How often (in-race seconds) each car independently rolls for a random event. */
  EVENT_CHECK_INTERVAL_SECONDS: 0.5,
  /** Chance (0-1) a given roll produces *any* event; half of those that do are a boost, half
   * a slowdown attempt (see SLOWDOWN_SHARE). */
  EVENT_CHANCE: 0.35,
  /** Of the events that fire, the fraction that roll as a slowdown attempt rather than a
   * boost. */
  SLOWDOWN_SHARE: 0.5,
  /** Progress granted by a boost event ("CRIT!"). */
  BOOST_AMOUNT: 10,
  /** Progress cost of a slowdown event that isn't resisted ("DRIFT!"). A resisted one costs
   * nothing and shows no floating text at all — it just didn't happen. */
  SLOWDOWN_AMOUNT: 8,
  /** Baseline chance (0-1) to resist a slowdown attempt, at the 100-baseline Handling stat. */
  BASE_RESIST_CHANCE: 0.35,
  /** Extra resist chance per Handling point above the 100 baseline. Consumers should clamp
   * the result (see AutoDragRace) — this is high enough that a heavily-upgraded car can
   * otherwise approach guaranteed immunity, which would make the resist roll pointless. */
  RESIST_CHANCE_PER_HANDLING: 0.004,

  /** The rival's stats jitter randomly within +/- this fraction of the player's own stats
   * each race (rolled once, at the green light), so upgrading your car still shifts the odds
   * in your favor on average without turning every race into a foregone conclusion. */
  RIVAL_STAT_JITTER: 0.25,
} as const;
