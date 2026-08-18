import type { PartPerk } from './parts';
import type { CarStats } from '../types';

/** Offline (AFK) progress is capped at this many hours away, so a very stale save (or a
 * fiddled system clock) can't award an absurd amount. Restricts *time away*, not a flat Scrap
 * amount — the actual ceiling in Scrap terms still scales with the player's own
 * scrapPerSecond (see getMaxAfkCapacityScrap below), so raising or lowering this number alone
 * never needs a matching change per car tier. Exported standalone (not just buried inside
 * ECONOMY) since the Garage's AFK Storage panel needs the *hours* figure directly to display,
 * not just the seconds value ECONOMY.MAX_OFFLINE_SECONDS derives from it below. */
export const MAX_OFFLINE_HOURS = 12;

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
   * Lowered from 3.5 to 1.8 when the roster grew from 10 car tiers to 20 — the old 3.5x/tier
   * rate was tuned for a 10-tier climb; left unchanged across 20 tiers it compounds twice as
   * many times, pushing Tier 20 out to centuries. Left at 1.8 by the most recent rebalance
   * below (PART_BUY_COST_MULTIPLIER was the actual lever that needed fixing, not this one). */
  BUY_PART_COST_TIER_MULTIPLIER: 1.8,
  /** Each part bought within the current car's lifetime multiplies the next one's cost by
   * this factor — the standard compound-growth idle-game curve.
   *
   * A prior value of 1.13 here was documented as landing "~105 days" to clear all 20 tiers,
   * but that number was never actually reproducible: simulated properly against the real
   * mechanics (getPartBuyCost/getUpgradeRequirement/tradeInCar, an always-available/"perfect"
   * player, fixed energy regen), 1.13 clears Tier 20 in ~2197 days (~6 years), not ~105 — the
   * old comment was simply wrong. The reason 1.13 blows up this badly:
   * getUpgradeRequirement caps at 8 installs/tier from Tier 11 onward, i.e. 64 Lv.1 part
   * purchases per tier before a trade-in resets partsPurchased back to 0, and this multiplier
   * compounds across *all* of them uninterrupted — 1.13^63 ≈ 2,200x just within one late
   * tier, on top of BUY_PART_COST_TIER_MULTIPLIER's own 1.8x-per-tier growth on top of that.
   * Re-simulated (see the economy sim this rebalance was verified against) and re-tuned to
   * 1.062, which lands a full 20-tier clear at ~89 days for that same always-available
   * player — Tiers 1-8 still clear within hours each (the early game still opens easy), Tier
   * 20 alone takes ~18-19 days (the late game still ramps up hard), and the 20-tier total
   * lands solidly inside the intended "~3 months for a highly active, optimal player" target
   * instead of years past it. */
  PART_BUY_COST_MULTIPLIER: 1.062,

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

  /** Offline progress is capped at this many seconds — MAX_OFFLINE_HOURS above converted to
   * seconds, since applyOfflineProgress() (GameStore.ts) compares against a ms-derived elapsed
   * time. Every call site already works in seconds, so this stays its own field rather than
   * making each one re-multiply MAX_OFFLINE_HOURS * 3600 independently. */
  MAX_OFFLINE_SECONDS: MAX_OFFLINE_HOURS * 60 * 60,
  /** Below this many Scrap, the "Welcome back" toast doesn't bother showing. */
  MIN_OFFLINE_EARNINGS_TO_SHOW: 1,

  /** Each Junkyard upgrade purchase multiplies that upgrade's own next cost by this factor. */
  UPGRADE_COST_MULTIPLIER: 1.15,
  /** The Profile screen's History tab only ever shows this many of the most recent $NEON
   * transactions — old entries just fall off the end rather than growing the save forever. */
  NEON_HISTORY_MAX_ENTRIES: 50,
} as const;

/** The most Scrap a player's AFK/offline storage can possibly hold at their *current*
 * scrapPerSecond — i.e. what MAX_OFFLINE_HOURS away would earn them, back-to-back, with
 * nothing collected in between. Deliberately a function of scrapPerSecond, not a flat number:
 * the cap that's actually enforced (see applyOfflineProgress in GameStore.ts) restricts *time*
 * away, so this figure automatically scales with every scrapPerSecond-boosting upgrade,
 * calibration, and trade-in without needing a per-tier override anywhere. Used by the Garage's
 * AFK Storage panel to show the player exactly what they stand to lose by staying away past
 * the cap. */
export function getMaxAfkCapacityScrap(scrapPerSecond: number): number {
  return scrapPerSecond * MAX_OFFLINE_HOURS * 60 * 60;
}

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

/** Tuning for the Race Hub's "Auto-Drag" mode: a hands-off auto-battler. "Race vs Player" is
 * real (mock, for now — see src/game/mock/matchmaking.ts) League-matched PvP: the opponent's
 * stats come straight from their own car tier via getCarStats, same as the player's. "Syndicate
 * Bot" is a separate, simpler mode against a flat, disclosed-difficulty baseline (no
 * matchmaking, no waiting). Both compute win chance the same honest way and roll against
 * exactly that number — there is no hidden gap between the displayed odds and the real ones. */
export const AUTO_DRAG = {
  /** Selectable bet tiers, kept modest (not the much bigger round numbers a bet-screen mockup
   * might suggest) so a fresh save (ECONOMY.STARTING_NEON: 50) can always afford the low
   * tier. Also the only bet amounts the mock matchmaking backend hosts/lists. */
  BET_TIERS: [10, 25, 50] as const,
  /** Gross payout on a win against a real (League-matched) Player opponent is this many times
   * the bet. */
  GROSS_WIN_MULTIPLIER_PLAYER: 2,
  /** Gross payout on a win against the tougher "AI Racer" rival — bigger, since
   * BOT_RIVAL_STAT_MULTIPLIER makes that win chance lower for the same car. */
  GROSS_WIN_MULTIPLIER_BOT: 2.6,
  /** The Syndicate's cut of the gross payout on a win, either mode — light, since there's no
   * timing skill here to reward, just the bet and opponent choice. */
  SYSTEM_TAX_RATE: 0.05,

  /** "Average street racer" baseline that AI Racer's difficulty multiplier scales up from
   * below — Race vs Player no longer uses a flat baseline at all (real opponents' stats come
   * from their own tier), so this constant is Bot-only now. */
  BOT_RIVAL_BASE_STAT: 100,
  /** AI Racer's stats are the baseline above, scaled up by this much — a real, disclosed
   * difficulty bump, not a hidden one. */
  BOT_RIVAL_STAT_MULTIPLIER: 1.35,
  /** Win chance (topSpeed+acceleration+handling power ratio) is clamped to this range so
   * neither side is ever a mathematical lock — see computeWinChance in RaceScreen.tsx. */
  MIN_WIN_CHANCE_PERCENT: 8,
  MAX_WIN_CHANCE_PERCENT: 92,

  /** The scripted race animation is chopped into this many uneven segments so the fill looks
   * like bursts of speed rather than a metronomic ramp. */
  RACE_STEPS: 7,
  /** Total race animation length is randomized in this range (seconds) each race, purely for
   * variety — has no bearing on the win/loss RNG, which is already resolved before the first
   * frame plays. */
  RACE_DURATION_MIN_SECONDS: 3,
  RACE_DURATION_MAX_SECONDS: 4,
  /** The predetermined loser's bar still climbs, just short of 100 — randomized in this range
   * so it's not always a suspiciously round number. */
  LOSER_FINAL_PROGRESS_MIN: 55,
  LOSER_FINAL_PROGRESS_MAX: 90,
  /** The predetermined winner's designated "NITRO!" segment gets its random weight scaled up
   * by this much before the segments are normalized — a visible surge, not just noise. */
  WINNER_BOOST_MULTIPLIER: 2.2,
  /** The predetermined loser's occasional "DRIFT!" segment gets scaled down by this much
   * instead — a visible stumble, used together with STUMBLE_CHANCE below. */
  LOSER_STUMBLE_MULTIPLIER: 0.15,
  /** Chance (0-1) the loser gets an early stumble segment at all — otherwise their climb is
   * just evenly noisy, no scripted dip. */
  STUMBLE_CHANCE: 0.5,
  /** Chance (0-1) the loser's early segments are front-loaded (scaled up) — this is what
   * produces "the loser takes an early lead before the winner's Nitro catches them." */
  FRONT_LOAD_CHANCE: 0.6,
  FRONT_LOAD_MULTIPLIER: 1.6,
} as const;

/** One sector of Smuggler's Run — the chance of clearing it, and the total payout multiplier
 * (applied to the entry fee) if the player cashes out immediately after clearing it. Chance
 * drops and reward climbs every sector, the standard push-your-luck curve: each further step
 * is a strictly worse bet in expected value (chance × multiplier shrinks tier over tier) so the
 * tension is real, not free — see SMUGGLERS_RUN.SECTORS below for the actual numbers. */
export interface SmugglersRunSector {
  successChance: number;
  rewardMultiplier: number;
}

/** Tuning for the Race Hub's "Smuggler's Run": a solo push-your-luck run through 4 sectors.
 * Every sector cleared is a mandatory decision — bank the current multiplier or push deeper for
 * a worse-odds, bigger payout — until either a cash-out or a bust (which forfeits the entry fee
 * and everything accumulated). Odds and multipliers are hardcoded client-side for now (see
 * src/game/mock/smugglerApi.ts) rather than fetched, same TODO-real-backend shape as
 * matchmaking.ts.
 *
 * Entry fee and payout are $NEON, not Scrap — The Streets (every racing mode: Auto-Drag,
 * Smuggler's Run) is a premium-currency zone by design, so a losing streak can never eat into
 * the Garage's Scrap-driven car progression, and Scrap can never leak out through racing either
 * (see ECONOMY.STARTING_NEON/the 3-month Garage rebalance above — that simulation assumes
 * *zero* Scrap income or expense from racing, which is only true once this line is $NEON). */
export const SMUGGLERS_RUN = {
  ENTRY_FEE_NEON: 15,
  SECTORS: [
    { successChance: 0.65, rewardMultiplier: 1.5 },
    { successChance: 0.40, rewardMultiplier: 3.0 },
    { successChance: 0.15, rewardMultiplier: 5.0 },
    { successChance: 0.05, rewardMultiplier: 10.0 },
  ] satisfies SmugglersRunSector[],
  /** How long the "Evading Cops..." tense loading state holds before a sector's result reveals
   * — purely dramatic pacing, has no bearing on the RNG roll itself (already resolved server-
   * side, or in this mock, the instant resolveSector is called). */
  RESOLVE_DELAY_MS: 1500,
} as const;

/** Tuning for Night Siege: a Syndicate-only cooperative World Boss raid (see
 * src/screens/SyndicateHub.tsx — it's gated behind clan membership, not a Race Hub mode card).
 * A raid has to be explicitly started by the Leader or a Co-Leader (see NIGHT_SIEGE_ROLES/
 * night-siege.mts's 'start-raid' action) — there's no boss to hit at all until then. Once one's
 * up, any member can spend an 8h cooldown window on a TAP_PHASE_SECONDS-long tapping session:
 * every tap deals TAP_DAMAGE_PER_TIER × their car tier, and the *total* accumulated across the
 * whole session is submitted to the server in one batch at the end (see
 * src/game/mock/siegeApi.ts) rather than one request per tap. A shared kill's loot is a
 * Syndicate-wide concern, not a per-tap Scrap/Neon payout, so there's deliberately no
 * reward-per-damage rate here. */
export const NIGHT_SIEGE = {
  /** Full HP of a freshly-spawned Corporate Convoy — shared across the whole Syndicate, not
   * per-player; it genuinely takes the whole roster chipping in across multiple 8h cooldown
   * windows. */
  BOSS_MAX_HP: 10_000_000,
  /** How long a single Convoy lives before it auto-expires if it's still standing — see
   * bossExpiresAt in netlify/functions/night-siege.mts. A boss that times out without being
   * killed grants nobody the reward; a Leader/Co-Leader has to explicitly start a fresh raid
   * afterward, same as after a kill — there's no automatic respawn. */
  BOSS_LIFETIME_MS: 72 * 60 * 60 * 1000,
  /** Each player can start at most one tapping session every this many ms — tracked per-player
   * (independent of which specific boss instance happens to be up; the cooldown survives a
   * kill, an expiry, or a Leader starting the next raid), and only actually reserved once that
   * session's total damage is submitted at the end — see lastBossAttackTime in PlayerState for
   * the fast local mirror, and the server's own `night-siege-attack-cooldown` Blobs store
   * (night-siege.mts) for the actual enforced gate. */
  ATTACK_COOLDOWN_MS: 8 * 60 * 60 * 1000,
  /** How long a single tapping session lasts, from the moment "Attack" is pressed to the
   * moment the accumulated damage is submitted. */
  TAP_PHASE_SECONDS: 15,
  /** Each tap deals this much damage per point of the tapper's car tier — deterministic per
   * tap (not random), so every tap during a session is worth exactly the same amount; only the
   * *number* of taps landed varies. */
  TAP_DAMAGE_PER_TIER: 50,
  /** Hard ceiling on how many taps a single session's submitted total could plausibly
   * represent, enforced server-side (see getMaxNightSiegeSessionDamage below) — generous for
   * genuinely fast tapping (90 taps in TAP_PHASE_SECONDS is 6 taps/sec) while still bounding
   * what a tampered client can claim it landed. */
  MAX_TAPS_PER_SESSION: 90,
  /** $NEON reward for the Leader once the shared boss's HP reaches 0 — see
   * netlify/functions/night-siege.mts's `claimedBy` tracking for how "once per account" is
   * enforced server-side, and getNightSiegeReward below for how a claimant's role picks which
   * of these three tiers applies. Highest tier: the Leader carries the most accountability for
   * organizing the raid. */
  REWARD_NEON_LEADER: 250,
  /** $NEON reward for a Co-Leader on the same kill. */
  REWARD_NEON_CO_LEADER: 150,
  /** $NEON reward for a regular member on the same kill — still a solid cut for
   * participating, just not the top tier. */
  REWARD_NEON_MEMBER: 75,
} as const;

/** A player's standing within their Syndicate — mirrors SyndicateHub.tsx's own `MyRole` type
 * (kept as a separate, independently-defined 3-value union there rather than importing this,
 * matching this codebase's convention of small local type duplication over a shared brittle
 * common-types module) and night-siege.mts's own server-side copy of the same 3 strings. */
export type SyndicateRole = 'leader' | 'co-leader' | 'member';

/** The $NEON reward for a boss kill, tiered by the claimant's role within the Syndicate — see
 * NIGHT_SIEGE.REWARD_NEON_LEADER/CO_LEADER/MEMBER's own doc comments for why these differ. */
export function getNightSiegeReward(role: SyndicateRole): number {
  if (role === 'leader') return NIGHT_SIEGE.REWARD_NEON_LEADER;
  if (role === 'co-leader') return NIGHT_SIEGE.REWARD_NEON_CO_LEADER;
  return NIGHT_SIEGE.REWARD_NEON_MEMBER;
}

/** Whether this player's attack cooldown has elapsed — true if they've never attacked, or
 * NIGHT_SIEGE.ATTACK_COOLDOWN_MS have passed since lastAttackTime. Pure function of
 * (lastAttack, now), same shape as isNeonSyphonClaimable/isDailyRewardClaimable, so both the
 * live countdown UI and (server-side, against its own record) the actual gate derive the same
 * answer from the same rule.
 *
 * Treats anything that isn't a real, finite number (not just `null`) as "never attacked" —
 * `lastAttackTime` is typed as `number | null`, but a save written before this field existed,
 * or a malformed/legacy record, can hand this an `undefined` or otherwise non-numeric value at
 * runtime despite what the type says. `undefined - now` (or similar) would silently evaluate to
 * `NaN`, and every comparison against `NaN` is `false` — which previously meant a legacy value
 * here made this permanently return `false` (attack locked forever) instead of the intended
 * "no record yet, so go ahead" behavior. */
export function isBossAttackAvailable(lastAttackTime: number | null, now: number): boolean {
  if (lastAttackTime === null || !Number.isFinite(lastAttackTime)) return true;
  return now - lastAttackTime >= NIGHT_SIEGE.ATTACK_COOLDOWN_MS;
}

/** The deterministic damage a single tap deals during a Night Siege session, purely a function
 * of the tapper's car tier — used client-side both to add to the running session total on
 * every tap and to show "each tap deals X" before the session starts. */
export function getNightSiegeTapDamage(carTier: number): number {
  return carTier * NIGHT_SIEGE.TAP_DAMAGE_PER_TIER;
}

/** The highest `totalSessionDamage` a given car tier could plausibly submit — one tap's damage
 * times the max taps a TAP_PHASE_SECONDS session could realistically land. The server clamps
 * every submission to this (see night-siege.mts's handleSubmitDamage) rather than trusting a
 * client-reported total outright, without recomputing the total itself from scratch — this
 * project's established client-trusted-economy model, just with a sanity ceiling. */
export function getMaxNightSiegeSessionDamage(carTier: number): number {
  return getNightSiegeTapDamage(carTier) * NIGHT_SIEGE.MAX_TAPS_PER_SESSION;
}

/** One day's Daily Reward — always exactly one of Scrap or $NEON, never both, so the claim
 * toast/UI never has to handle a split payout. */
export interface DailyRewardTier {
  day: number;
  scrap?: number;
  neon?: number;
}

/** The retention login-streak reward table, keyed by streak day (1-indexed). Days 1-6 escalate
 * in Scrap (sized against the early-game economy above — Tier 1 parts cost ~15-27 Scrap, so Day
 * 1's 500 is a meaningful multi-part boost, not a whole-tier skip), Day 7 pays out in $NEON
 * instead, both a bigger "why bother with the whole week" payoff and a taste of the premium
 * currency for a player who hasn't touched The Streets yet.
 *
 * Deliberately kept modest rather than economy-defining: an earlier pass had these at 100x these
 * numbers (50,000-800,000 Scrap, 25 $NEON), which handed out several car tiers' worth of parts
 * in one tap and made the streak itself pointless to protect — a reward that big is claimed once
 * and forgotten, not something a player logs back in for. Scaled down so each day is a genuine,
 * felt boost (roughly a double-digit-to-low-hundreds multiple of a Tier 1 part's price) without
 * ever being the fastest way to progress — that's still buying parts/calibrating/trading in.
 *
 * getDailyRewardForStreak below cycles this table forever past Day 7 (Day 8 repeats Day 1's
 * reward, Day 14 repeats Day 7's, ...) rather than capping — a streak has no defined end. */
export const DAILY_REWARDS: readonly DailyRewardTier[] = [
  { day: 1, scrap: 500 },
  { day: 2, scrap: 1_000 },
  { day: 3, scrap: 2_000 },
  { day: 4, scrap: 3_500 },
  { day: 5, scrap: 5_500 },
  { day: 6, scrap: 8_000 },
  { day: 7, neon: 25 },
] as const;

/** Below this many hours since the last claim, the reward isn't ready yet — claiming exactly
 * once per real calendar day (rolling 24h window, not a calendar-date boundary, so timezone
 * changes/travel can't be gamed into a same-day double claim). */
export const DAILY_REWARD_CLAIM_WINDOW_HOURS = 24;
/** Above this many hours since the last claim, the streak is broken — matches the literal "a
 * full day missed" spec: claiming again within this window (i.e. sometime in the *next* day
 * after becoming eligible, not just the instant it opens) still continues the streak, waiting
 * any longer resets it to a fresh Day 1 on the next claim. */
export const DAILY_REWARD_STREAK_RESET_HOURS = 48;

/** Which reward tier a given streak count (1-indexed, so a first-ever claim is streak 1) maps
 * to — see DAILY_REWARDS' own doc comment for why this cycles rather than stopping at Day 7. */
export function getDailyRewardForStreak(streak: number): DailyRewardTier {
  const index = (Math.max(1, streak) - 1) % DAILY_REWARDS.length;
  return DAILY_REWARDS[index];
}

/** Whether a claim is available right now — true for a player who has never claimed, or once
 * DAILY_REWARD_CLAIM_WINDOW_HOURS have passed since the last one. Pure function of
 * (lastClaim, now) so both the store's claimDailyReward action and the Garage's live claimable-
 * badge indicator derive the exact same answer from the exact same rule. */
export function isDailyRewardClaimable(lastClaim: number | null, now: number): boolean {
  if (lastClaim === null) return true;
  return now - lastClaim >= DAILY_REWARD_CLAIM_WINDOW_HOURS * 60 * 60 * 1000;
}

/** Tuning for the Shop's premium Telegram Stars item — a temporary passive-income multiplier,
 * sold as "the auto-mechanic works the Garage for you." Modeled purely as a multiplier applied
 * at the point Scrap is actually earned (see getBoostedScrapEarned below), never as a stored
 * mutation of scrapPerSecond itself — that way it needs no "undo" when it expires and can't
 * drift out of sync with whatever else is touching scrapPerSecond (calibration/trade-in growth)
 * in the meantime. */
export const OVERCLOCK = {
  DURATION_HOURS: 24,
  /** While active, both the live per-second tick and offline-progress catch-up earn Scrap at
   * this many times the normal scrapPerSecond rate. */
  SCRAP_PER_SECOND_MULTIPLIER: 3,
  /** Price in Telegram Stars (XTR) — see the createOverclockInvoice placeholder in
   * netlify/functions/create-invoice.mts for where this becomes an actual invoice amount. */
  STARS_PRICE: 150,
} as const;

/** Whether the Overclock boost is currently active. */
export function isOverclockActive(boostEndsAt: number | null, now: number): boolean {
  return boostEndsAt !== null && boostEndsAt > now;
}

/** Tuning for the Shop's premium "Mega Overclock" tier — the same passive-income multiplier
 * mechanic as OVERCLOCK above (it extends the exact same `boostEndsAt` clock, so the two stack
 * into one shared countdown regardless of which tier a purchase was), just a 3-day (72h)
 * duration instead of 24h for a correspondingly bigger Stars price. What makes this tier
 * genuinely different, not just "the same boost, longer": for as long as *this* purchase's own
 * effect is active (see megaBoostEndsAt in game/types/index.ts, tracked separately from
 * boostEndsAt), the AFK/offline cap is also raised from the normal ECONOMY.MAX_OFFLINE_SECONDS to
 * EXTENDED_OFFLINE_HOURS — see getEffectiveMaxOfflineSeconds below — so a player about to be away
 * for a multi-day trip doesn't lose out on offline earnings past the normal 12h ceiling. Buying a
 * *regular* 24h Overclock on top of an active Mega Overclock only extends the shared multiplier
 * clock; it does not touch megaBoostEndsAt, so the extended AFK cap still expires on its own
 * original schedule — that privilege is specific to what was actually paid for. */
export const MEGA_OVERCLOCK = {
  DURATION_HOURS: 72,
  /** The AFK/offline cap while this boost is active, in hours — see
   * getEffectiveMaxOfflineSeconds below. */
  EXTENDED_OFFLINE_HOURS: 72,
  /** Price in Telegram Stars (XTR) — see ITEM_CONFIG in netlify/functions/create-invoice.mts. */
  STARS_PRICE: 300,
} as const;

/** Whether the Mega Overclock's own extended-AFK-cap privilege is currently active — distinct
 * from isOverclockActive, which only tracks the shared scrap-multiplier clock both tiers write
 * into. */
export function isMegaOverclockActive(megaBoostEndsAt: number | null, now: number): boolean {
  return megaBoostEndsAt !== null && megaBoostEndsAt > now;
}

/** The AFK/offline cap (in seconds) that actually applies to a given offline gap: the normal
 * ECONOMY.MAX_OFFLINE_SECONDS, unless a Mega Overclock was still active at the exact moment this
 * device went offline (`megaBoostEndsAt` newer than `lastSaved`), in which case the whole gap is
 * capped at MEGA_OVERCLOCK.EXTENDED_OFFLINE_HOURS instead. Deliberately a single either/or answer
 * for the whole gap rather than splitting it into boosted/non-boosted sub-windows (the way
 * getBoostedScrapEarned splits the *scrap* multiplier) — the AFK cap is a coarse anti-abuse
 * ceiling, not a precise economic lever, so "was Mega Overclock running when you left" is a
 * simple, defensible rule that doesn't need that level of precision. */
export function getEffectiveMaxOfflineSeconds(
  megaBoostEndsAt: number | null,
  lastSaved: number,
): number {
  if (megaBoostEndsAt !== null && megaBoostEndsAt > lastSaved) {
    return MEGA_OVERCLOCK.EXTENDED_OFFLINE_HOURS * 60 * 60;
  }
  return ECONOMY.MAX_OFFLINE_SECONDS;
}

/** Scrap earned over a `[windowStart, now]` span, honoring the Overclock multiplier for exactly
 * however much of that span fell before `boostEndsAt` (and the normal rate for the rest) —
 * shared by both tick() (called every ECONOMY.TICK_INTERVAL_MS while the app is open) and
 * applyOfflineProgress() (a single, potentially much longer span), so a boost that expires
 * *while the app is closed* still pays out exactly what it would have live, instead of either
 * the whole offline span getting the multiplier (if it merely checked "is boost active now") or
 * none of it (if it didn't account for the boost at all). */
export function getBoostedScrapEarned(
  scrapPerSecond: number,
  windowStart: number,
  now: number,
  boostEndsAt: number | null,
): number {
  const deltaSeconds = (now - windowStart) / 1000;
  if (deltaSeconds <= 0) return 0;
  if (boostEndsAt === null || boostEndsAt <= windowStart) {
    return scrapPerSecond * deltaSeconds;
  }
  const boostedUntil = Math.min(now, boostEndsAt);
  const boostedSeconds = Math.max(0, (boostedUntil - windowStart) / 1000);
  const normalSeconds = deltaSeconds - boostedSeconds;
  return (
    scrapPerSecond * OVERCLOCK.SCRAP_PER_SECOND_MULTIPLIER * boostedSeconds +
    scrapPerSecond * normalSeconds
  );
}

/** The Shop's Exchange grid: premium $NEON converted into Garage-progression Scrap at a fixed
 * rate. One-way (Scrap can never convert back into $NEON) — this is a Scrap-progression relief
 * valve for players sitting on spare racing winnings, not a way to launder Scrap into racing
 * currency. */
export const NEON_TO_SCRAP_RATE = 1000;

export interface NeonExchangePackage {
  neon: number;
  scrap: number;
}

export const NEON_EXCHANGE_PACKAGES: readonly NeonExchangePackage[] = [
  { neon: 1, scrap: 1 * NEON_TO_SCRAP_RATE },
  { neon: 10, scrap: 10 * NEON_TO_SCRAP_RATE },
  { neon: 50, scrap: 50 * NEON_TO_SCRAP_RATE },
] as const;

/** Tuning for "Neon Syphon" — The Streets' free, time-gated trickle of $NEON, there so a
 * Free-to-Play player always has *some* way to earn premium currency without racing or paying,
 * just a slow and strictly rate-limited one so it can never substitute for either. A flat 24h
 * cooldown (not per-calendar-day) keeps it exactly once-per-24h regardless of what time of day
 * the player claims at, same reasoning as DAILY_REWARD_CLAIM_WINDOW_HOURS above. */
export const NEON_SYPHON = {
  COOLDOWN_MS: 24 * 60 * 60 * 1000,
} as const;

/** The $NEON payout for one claim, scaled to the player's current Garage tier — Tier 1 nets 1
 * $NEON, Tier 20 nets 11, a deliberately modest curve (never a substitute for racing/Overclock)
 * that still gives high-tier progress *some* payoff here too. */
export function getNeonSyphonReward(carTier: number): number {
  return Math.floor(1 + carTier * 0.5);
}

/** Whether a claim is available right now — true for a player who has never claimed, or once
 * NEON_SYPHON.COOLDOWN_MS have passed since lastNeonSyphonTime. Pure function of (lastClaim,
 * now), same shape as isDailyRewardClaimable, so both the store action and the live countdown
 * UI derive the exact same answer from the exact same rule. */
export function isNeonSyphonClaimable(lastClaim: number | null, now: number): boolean {
  if (lastClaim === null) return true;
  return now - lastClaim >= NEON_SYPHON.COOLDOWN_MS;
}

/** Tuning for the milestone-based Referral System (see netlify/functions/referrals.mts). An
 * invitee reaching MILESTONE_CAR_TIER credits *both* sides — but only for a genuine referral: an
 * account with no inviter on record gets nothing from this system at all, regardless of its own
 * tier. Rewards never land directly in `neon`/`scrap`; they accumulate in
 * `unclaimedNeon`/`unclaimedScrap` until the player manually claims them from the REF tab's
 * Vault (see claimReferralRewards in GameStore.ts) — a deliberate "manual claim" mechanic, not a
 * bug where rewards seem to vanish. */
export const REFERRAL = {
  /** $NEON credited to *each* side (invitee's own pool, and separately the inviter's) once a
   * genuinely-referred invitee reaches MILESTONE_CAR_TIER. */
  MILESTONE_NEON_REWARD: 10,
  /** Scrap credited alongside MILESTONE_NEON_REWARD, same both-sides rule. */
  MILESTONE_SCRAP_REWARD: 25_000,
  /** The car tier that fires the milestone credit — see tradeInCar in GameStore.ts. */
  MILESTONE_CAR_TIER: 5,
  /** How many of an account's own invitees must individually reach MILESTONE_CAR_TIER before
   * the invite-3-friends Airdrop quest below counts as complete. */
  QUEST_REQUIRED_VALID_REFERRALS: 3,
} as const;

/** One Airdrop quest — a one-time reward for hitting a specific, checkable milestone.
 * Completion is derived (see isQuestComplete below), never stored directly, so it can never
 * drift out of sync with the actual state it's checking; only *claiming* it is stored (see
 * PlayerState.claimedQuests), since that's the one-time, irreversible part. */
export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  neonReward?: number;
  scrapReward?: number;
  action?: {
    type: 'telegram-link';
    url: string;
  };
}

export const QUESTS: readonly QuestDefinition[] = [
  {
    id: 'subscribe_telegram_channel',
    title: 'Join Official Channel',
    description: 'Subscribe to @cyber_garage_official to stay updated and claim your reward.',
    scrapReward: 5_000,
    action: {
      type: 'telegram-link',
      url: 'https://t.me/cyber_garage_official',
    },
  },
  {
    id: 'connect-wallet',
    title: 'Connect TON Wallet',
    description: 'Link a TON wallet from the Profile screen.',
    neonReward: 10,
  },
  {
    // Was 'reach-tier-5' (Tier 5), raised to Tier 10 — kept a distinct id rather than reusing
    // the old one so this reads unambiguously as its own milestone; a save that already
    // claimed the old Tier 5 version simply keeps that claimedQuests entry as a harmless
    // orphan (it no longer matches anything in this list), same as a retired Junkyard upgrade
    // id falling out of UPGRADE_BLUEPRINTS (see reconcileUpgrades in GameStore.ts).
    id: 'reach-tier-10',
    title: 'Reach Tier 10 Car',
    description: 'Trade in for a Tier 10 or higher car in the Garage.',
    neonReward: 25,
  },
  {
    id: 'win-10-races',
    title: 'Win 10 Races',
    description: 'Win 10 races in Auto-Drag (Race vs Player only).',
    neonReward: 50,
  },
  {
    id: 'join-syndicate',
    title: 'Join or Create a Syndicate',
    description: 'Team up — join an existing Syndicate or start your own from the Syndicate Hub.',
    neonReward: 15,
  },
  {
    id: 'invite-3-friends',
    title: 'Invite 3 Friends (Tier 5 required)',
    description: 'Get 3 invited friends to reach Tier 5 — see the REF tab for your link and progress.',
    neonReward: 75,
  },
] as const;

/** Just the slice of PlayerState each quest's completion check actually needs — kept as its
 * own small shape (rather than importing all of PlayerState here) so economy.ts stays a pure
 * config/derivation module with no dependency on the store's own types. */
export interface QuestProgress {
  walletAddress: string | null;
  carTier: number;
  racesWon: number;
  syndicateId: string | null;
  validReferralsCount: number;
  hasJoinedChannel: boolean;
}

/** Whether a given quest's milestone has been reached — independent of whether it's already
 * been claimed (see PlayerState.claimedQuests for that). Add a new `case` here whenever a quest
 * is added to QUESTS above. */
export function isQuestComplete(questId: string, progress: QuestProgress): boolean {
  switch (questId) {
    case 'subscribe_telegram_channel':
      return progress.hasJoinedChannel;
    case 'connect-wallet':
      return progress.walletAddress !== null;
    case 'reach-tier-10':
      return progress.carTier >= 10;
    case 'win-10-races':
      return progress.racesWon >= 10;
    case 'join-syndicate':
      return progress.syndicateId !== null;
    case 'invite-3-friends':
      return progress.validReferralsCount >= REFERRAL.QUEST_REQUIRED_VALID_REFERRALS;
    default:
      return false;
  }
}

/** A quest's progress as a plain `current`/`target` pair, for AirdropScreen.tsx's per-quest
 * progress bar — `target` is always 1 for the two boolean milestones (connect a wallet, join a
 * Syndicate), so their bar is either empty or full with no fraction worth printing; the other
 * three have a real target above 1. `current` is clamped to `target` so an already-complete
 * quest's bar reads as a clean 100% rather than, say, "14 / 10" once racesWon keeps climbing
 * past the milestone. */
export interface QuestProgressValue {
  current: number;
  target: number;
}

export function getQuestProgressValue(questId: string, progress: QuestProgress): QuestProgressValue {
  switch (questId) {
    case 'subscribe_telegram_channel':
      return { current: progress.hasJoinedChannel ? 1 : 0, target: 1 };
    case 'connect-wallet':
      return { current: progress.walletAddress !== null ? 1 : 0, target: 1 };
    case 'reach-tier-10':
      return { current: Math.min(progress.carTier, 10), target: 10 };
    case 'win-10-races':
      return { current: Math.min(progress.racesWon, 10), target: 10 };
    case 'join-syndicate':
      return { current: progress.syndicateId !== null ? 1 : 0, target: 1 };
    case 'invite-3-friends':
      return {
        current: Math.min(progress.validReferralsCount, REFERRAL.QUEST_REQUIRED_VALID_REFERRALS),
        target: REFERRAL.QUEST_REQUIRED_VALID_REFERRALS,
      };
    default:
      return { current: 0, target: 1 };
  }
}
