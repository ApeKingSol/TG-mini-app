import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  ECONOMY,
  UPGRADE_BLUEPRINTS,
  getPartBuyCost,
  getDailyRewardForStreak,
  isDailyRewardClaimable,
  DAILY_REWARD_STREAK_RESET_HOURS,
  type DailyRewardTier,
  getBoostedScrapEarned,
  NEON_TO_SCRAP_RATE,
  getNeonSyphonReward,
  isNeonSyphonClaimable,
  QUESTS,
  isQuestComplete,
  REFERRAL,
  getEffectiveMaxOfflineSeconds,
} from '../config/economy';
import { getPartTier, rollPartPerk, type PartPerk } from '../config/parts';
import { CAR_TIERS, getCarTier, getUpgradeRequirement } from '../config/carTiers';
import type { CarState, NeonTransaction, Part, PlayerState, Upgrade } from '../types';
import {
  trackWalletConnected,
  trackCarUpgraded,
  trackRacePlayed,
} from '../../utils/analytics';
import { notifyReferralMilestone } from '../mock/referralsApi';

const LEGACY_STORAGE_KEY = 'cyber_garage_state_v2';

/** Reads the Telegram user id directly from `window`, defensively — this runs at module
 * load time, before React (and the `useTelegram` hook) ever mounts. Exported so other
 * modules needing the same per-account identity (e.g. src/game/mock/syndicateApi.ts) derive
 * it the same way this save file does, rather than re-implementing their own reader that could
 * drift out of sync with it. */
export function getTelegramUserId(): string | null {
  try {
    const id = (
      window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number } } } };
      }
    ).Telegram?.WebApp?.initDataUnsafe?.user?.id;
    return typeof id === 'number' ? String(id) : null;
  } catch {
    return null;
  }
}

/** Falls back to a shared 'guest' slot outside Telegram (local dev in a plain browser tab). */
function getStorageKey(): string {
  const telegramUserId = getTelegramUserId();
  return telegramUserId ? `${LEGACY_STORAGE_KEY}-${telegramUserId}` : `${LEGACY_STORAGE_KEY}-guest`;
}

/** One-time copy from the old shared-across-everyone save key, so switching to
 * per-account saves doesn't wipe progress that already exists on this device. */
function migrateLegacySave(storageKey: string) {
  try {
    if (localStorage.getItem(storageKey)) return;
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) localStorage.setItem(storageKey, legacy);
  } catch {
    // localStorage can throw in privacy modes / disabled storage — safe to skip.
  }
}

const STORAGE_KEY = getStorageKey();
migrateLegacySave(STORAGE_KEY);

/** Whether this device already had *something* persisted for this account before this
 * session's store hydration ran — read directly off localStorage, before `persist`'s own
 * hydrate call has a chance to touch it. False on a genuinely fresh install, but also false
 * whenever Telegram has wiped the WebView's storage overnight, which is exactly the scenario
 * that caused a real data-wipe incident: a wiped-storage load falls back to
 * createInitialPlayerState()'s all-default state, whose `lastSaved: Date.now()` gets stamped
 * to "now" — making a completely empty local state look *newer* than a perfectly legitimate
 * but older cloud save under a naive last-write-wins timestamp comparison. useCloudSync reads
 * this flag to know its very first pull can't trust that comparison: there is nothing genuine
 * in local state yet for a timestamp to protect, so the cloud save must win outright. */
export const hadLocalSaveAtLoad = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    // localStorage can throw in privacy modes / disabled storage. Fail closed (treat as "had
    // a save") so a storage read error can never be misread as "definitely a wipe" and cause
    // a cloud save to be adopted over local state that might, for all this code can tell, be
    // perfectly fine.
    return true;
  }
})();

/** This device's persisted `lastSaved`, captured the moment it's rehydrated — *before*
 * applyOfflineProgress() re-stamps `lastSaved` to "now" on every single app open. useCloudSync
 * compares this frozen value (not the live store's `lastSaved`, which is now effectively
 * "right now" by the time the comparison happens) against the remote save's timestamp: since
 * local `lastSaved` gets touched on every load regardless of whether anything meaningful
 * happened, comparing it directly would make the local device win nearly every time and the
 * remote pull silently never apply. */
export let localLastSavedAtLoad = Date.now();

// One-time admin $NEON grant. There's no backend here — saves live entirely in each player's
// own browser/Telegram client — so the only way to credit a specific Telegram account is to
// have that account's own client apply the grant to itself the next time it loads. Guarded by
// checking neonHistory for the grant label already being present, so re-opening the app
// doesn't re-grant it.
export const ADMIN_TELEGRAM_ID = '8280101176';
const ADMIN_GRANT_AMOUNT = 10000;
const ADMIN_GRANT_LABEL = 'Admin Bonus';

/** True only for the single hardcoded admin Telegram id above — gates ProfileScreen.tsx's Admin
 * Panel and the adminGrantNeon/adminGrantScrap/adminNextCar/adminPrevCar actions below. Purely a
 * client-side convenience gate, same trust model as the one-time admin grants already applied in
 * applyOfflineProgress(): there's no backend account system here for a "real" permission check to
 * live in — every save is just this one player's own browser/Telegram-client storage, so an
 * ungated client has nothing cross-account to reach anyway. */
export function isAdminAccount(): boolean {
  return getTelegramUserId() === ADMIN_TELEGRAM_ID;
}

/** One-time admin Scrap grant, same rationale as the $NEON one above but guarded by its own
 * `hasReceivedAdminScrapGrant` flag instead of a neonHistory label — Scrap has no equivalent
 * transaction log to dedupe against. */
const ADMIN_SCRAP_GRANT_AMOUNT = 5_000_000;

/** Bump to wipe every existing save back to a fresh start on next load — see the `migrate`
 * option below for what "wipe" means for the admin account specifically.
 *
 * v2: the car roster grew from 10 tiers to 20, and several tiers in the middle got a newly
 * inserted car — that shifts what car tier N even means (a saved carTier is just a number,
 * so an existing save's Tier 2 would silently become a different car than the one it was
 * actually trading in for). The Tier cost curve was also re-tuned for the new 20-tier length
 * (see BUY_PART_COST_TIER_MULTIPLIER in economy.ts), which existing accumulated-scrap saves
 * would otherwise blow straight through.
 *
 * v3: PART_BUY_COST_MULTIPLIER was corrected from 1.13 to 1.062 — the old value's documented
 * "~105 days to clear all 20 tiers" turned out to be wrong when actually simulated (it's really
 * ~2197 days), so every save made under it is sitting on a curve that was never the intended
 * one. Existing Scrap/partsPurchased/scrapPerSecond progress doesn't translate cleanly onto the
 * corrected curve, same reasoning as v2. (dailyRewardStreak/lastDailyRewardClaim are also new
 * in this version, but those default safely via createInitialPlayerState() on their own and
 * aren't why this bumped.) */
const SAVE_VERSION = 4;

interface GameActions {
  /** Advances passive Scrap generation and Energy regen based on real elapsed time since the last save. */
  tick: () => void;
  addScrap: (amount: number) => void;
  /** Returns false without charging if the player can't afford it. */
  spendScrap: (amount: number) => boolean;
  /** label is recorded to neonHistory for the Profile screen's History tab. */
  addNeon: (amount: number, label?: string) => void;
  /** Returns false without charging if the player can't afford it. label is recorded to
   * neonHistory for the Profile screen's History tab. */
  spendNeon: (amount: number, label?: string) => boolean;
  /** Buys a new Lv.1 part into the first empty inventory slot, at the current exponential price. Returns false without charging if there's no empty slot or the player can't afford it. */
  buyPart: () => boolean;
  /** Moves (or swaps, if the target is occupied) a part between two inventory slots. */
  movePart: (fromIndex: number, toIndex: number) => void;
  /** Merges two identical-level parts into one of level + 1 (or +2 on a crit) at the target slot, clearing the dragged slot and spending Energy. Returns the new part and whether it crit on success, or null if the pair/energy is invalid (caller should snap the dragged part back). */
  mergeParts: (draggedIndex: number, targetIndex: number) => { part: Part; isCrit: boolean } | null;
  /** Pulls a Lv.4 part out of inventory and onto the car for Anti-Stall calibration. No-op if the slot isn't a maxed part or a calibration is already pending. */
  startCalibration: (partIndex: number) => void;
  /** Resolves the pending calibration: on success the part is consumed to permanently unlock its perk's effect and record it in `installedUpgrades`; otherwise it's returned to inventory. */
  completeCalibration: (success: boolean) => void;
  /** Awards Scrap for a tap (possibly a critical hit). Taps are free — no resource is spent. */
  handleTap: () => { isCrit: boolean; amount: number };
  /** Returns false without charging if the player can't afford this upgrade's current cost. */
  buyUpgrade: (id: string) => boolean;
  /** Once installedUpgrades reaches getUpgradeRequirement(carTier), resets installedUpgrades/partsPurchased and advances to the next car tier. No-op otherwise. */
  tradeInCar: () => void;
  /** Admin-only (see isAdminAccount) — grants `amount` $NEON directly, for testing/support.
   * A silent no-op for every other account, and for a non-finite or non-positive amount. */
  adminGrantNeon: (amount: number) => void;
  /** Admin-only (see isAdminAccount) — grants `amount` Scrap directly, same guard as
   * adminGrantNeon. */
  adminGrantScrap: (amount: number) => void;
  /** Admin-only (see isAdminAccount) — jumps straight to the next/previous car tier's art/name,
   * bypassing installedUpgrades/cost entirely (doesn't touch scrapPerSecond, partsPurchased, or
   * installedUpgrades, so it can't be used to cheese the real economy). Replaces the old
   * always-visible debug Prev/Next buttons in GarageScreen — now only reachable from
   * ProfileScreen.tsx's Admin Panel, gated by the same isAdminAccount() check. */
  adminNextCar: () => void;
  adminPrevCar: () => void;
  /** Fast-forwards Scrap/Energy for time elapsed since lastSaved, run once after the persisted save is rehydrated. */
  applyOfflineProgress: () => void;
  dismissOfflineEarnings: () => void;
  /** Overwrites state with a snapshot pulled from the cross-device sync backend (see
   * useCloudSync), then re-runs the same offline-progress catch-up applied on local
   * rehydration — the remote snapshot's own `lastSaved` may be stale by however long it's
   * been since that other device last pushed it. */
  hydrateFromRemote: (remoteState: PlayerState) => void;
  /** Claims today's Daily Reward if one is available (see isDailyRewardClaimable), crediting
   * Scrap or $NEON per getDailyRewardForStreak and advancing/resetting the streak. Returns the
   * tier that was actually granted so the UI can show what the player just got, or null if
   * nothing was claimable (called again before the window opens). */
  claimDailyReward: () => DailyRewardTier | null;
  /** Converts $NEON into Scrap at NEON_TO_SCRAP_RATE. Returns false without charging if the
   * player can't afford `neonAmount`. */
  exchangeNeonForScrap: (neonAmount: number) => boolean;
  /** Claims Neon Syphon's free $NEON trickle if the 24h cooldown has elapsed (see
   * isNeonSyphonClaimable), crediting getNeonSyphonReward(carTier) and resetting the cooldown.
   * Returns the amount granted so the UI can show it, or null if the cooldown hasn't elapsed. */
  claimNeonSyphon: () => number | null;
  /** Mirrors the connected TON wallet's address (from ProfileScreen.tsx's useTonAddress), or
   * clears it back to null on disconnect. Fires trackWalletConnected on every non-null address
   * change (including switching wallets) — never on disconnect or on re-runs with the same
   * address, so this can safely be called from a plain effect without its own debouncing. */
  setWalletAddress: (address: string | null) => void;
  /** Records one Auto-Drag race's outcome: increments racesWon on a win (driving the "Win 10
   * Races" Airdrop quest), and reports trackRacePlayed either way. Call this once per resolved
   * race, from wherever a race's winner is decided (see RaceScreen.tsx). */
  recordRaceResult: (result: 'win' | 'loss') => void;
  /** Claims one Airdrop quest's one-time reward. Returns false without crediting anything
   * if the quest id is unknown, its milestone isn't actually met yet (see isQuestComplete), or
   * it's already in claimedQuests. */
  claimQuest: (questId: string) => boolean;
  /** Credits `amount` $NEON (the server's own role-tiered getNightSiegeReward result — see
   * night-siege.mts's handleClaim) and records `bossId` into lastClaimedBossId. Call this only
   * *after* netlify/functions/night-siege.mts's 'claim' action has already confirmed the boss
   * is dead and this account hasn't claimed it yet — this action itself trusts its caller
   * completely (same client-trusted-economy model as claimNeonSyphon/claimQuest), it does not
   * re-verify anything server-side on its own. */
  creditBossKillReward: (bossId: string, amount: number) => void;
  /** Records `timestamp` into lastBossAttackTime, driving the local 8h cooldown countdown.
   * Call this only *after* netlify/functions/night-siege.mts's 'submit-damage' action has
   * already accepted the attack — same fast-local-mirror pattern as creditBossKillReward, the
   * server's own cooldown record is what actually enforces the gate. */
  recordBossAttack: (timestamp: number) => void;
  /** Mirrors this account's current Syndicate id (or null once solo again) — call from
   * SyndicateHub.tsx whenever its own create/join/leave/restore-on-load flow settles, so the
   * "Join or Create a Syndicate" Airdrop quest has a synchronous field to check without this
   * store needing to know anything else about Syndicates. */
  setSyndicateId: (syndicateId: string | null) => void;
  /** Adds `neonCredited`/`scrapCredited` to the Referral System's unclaimed pools — call only
   * with the amounts netlify/functions/referrals.mts's milestone-reached action actually
   * reports back after tradeInCar reaches REFERRAL.MILESTONE_CAR_TIER, never optimistically:
   * whether this account gets anything at all (and how much) depends entirely on whether it was
   * actually invited by someone, which only the backend's referral-links record knows. Both
   * amounts are 0 for an organic, unreferred Tier-5 crossing, in which case this is a safe no-op. */
  creditReferralMilestoneReward: (neonCredited: number, scrapCredited: number) => void;
  /** Moves exactly `neonClaimed`/`scrapClaimed` from the Referral System's unclaimed pools into
   * the real neon/scrap balances and zeroes both pools — call only with the amounts
   * netlify/functions/referrals.mts's claim-rewards action reports as *actually* claimed, never
   * with whatever unclaimedNeon/unclaimedScrap happened to be showing on screen right before
   * the request: those can differ if a fresh milestone credit landed in the gap between this
   * account's last poll and the claim itself, and the server's reported amount is what's
   * actually authoritative. */
  claimReferralRewards: (neonClaimed: number, scrapClaimed: number) => void;
  /** Force-refreshes just the Referral System's Vault numbers from
   * netlify/functions/referrals.mts's get-referrals-data action — used by ReferralsScreen.tsx
   * on mount so the REF tab doesn't have to wait for useCloudSync's next scheduled ~2s poll to
   * show numbers another device's activity (or this account's own inviter crediting) may have
   * just changed. */
  refreshReferralsData: (data: {
    unclaimedNeon: number;
    unclaimedScrap: number;
    validReferralsCount: number;
    totalReferralsCount: number;
  }) => void;
  completeTutorial: () => void;
  verifyChannelSubscription: () => void;
}

type GameStore = PlayerState & GameActions;

function createStartingCar(): CarState {
  return {
    id: 'starter-rustbucket',
    name: getCarTier(1).name,
  };
}

function createPart(level: number, excludePerks: PartPerk[] = []): Part {
  const perk = level >= ECONOMY.MAX_PART_LEVEL ? rollPartPerk(excludePerks) : undefined;
  return { id: crypto.randomUUID(), level, name: getPartTier(level).name, perk };
}

/** An 8-slot grid, the first STARTING_PARTS_COUNT filled with a Lv.1 part, the rest empty. */
function createStartingInventory(): (Part | null)[] {
  return Array.from({ length: ECONOMY.INVENTORY_SIZE }, (_, index) =>
    index < ECONOMY.STARTING_PARTS_COUNT ? createPart(1) : null,
  );
}

function createStartingUpgrades(): Upgrade[] {
  return UPGRADE_BLUEPRINTS.map((blueprint) => ({
    id: blueprint.id,
    name: blueprint.name,
    cost: blueprint.baseCost,
    effect: blueprint.effect,
    boost: blueprint.boost,
    owned: 0,
  }));
}

/** The plain-data half of a fresh save — shared by the store's own initial state and by
 * migrate() below, so a brand-new player and a wiped-on-migrate one can never drift apart. */
function createInitialPlayerState(): PlayerState {
  return {
    scrap: ECONOMY.STARTING_SCRAP,
    neon: ECONOMY.STARTING_NEON,
    car: createStartingCar(),
    carTier: 1,
    inventory: createStartingInventory(),
    partsPurchased: 0,
    energy: ECONOMY.STARTING_MAX_ENERGY,
    maxEnergy: ECONOMY.STARTING_MAX_ENERGY,
    lastEnergyRegenAt: Date.now(),
    pendingCalibrationPart: null,
    installedUpgrades: [],
    upgrades: createStartingUpgrades(),
    neonHistory: [],
    hasReceivedAdminScrapGrant: false,
    scrapPerClick: ECONOMY.STARTING_SCRAP_PER_CLICK,
    scrapPerSecond: ECONOMY.STARTING_SCRAP_PER_SECOND,
    critChance: ECONOMY.STARTING_CRIT_CHANCE,
    critMultiplier: ECONOMY.STARTING_CRIT_MULTIPLIER,
    offlineEarnings: null,
    lastOfflineCapacityRatio: 0,
    lastSaved: Date.now(),
    dailyRewardStreak: 0,
    lastDailyRewardClaim: null,
    boostEndsAt: null,
    megaBoostEndsAt: null,
    lastNeonSyphonTime: null,
    walletAddress: null,
    racesWon: 0,
    claimedQuests: [],
    lastClaimedBossId: null,
    lastBossAttackTime: null,
    syndicateId: null,
    unclaimedNeon: 0,
    unclaimedScrap: 0,
    validReferralsCount: 0,
    totalReferralsCount: 0,
    hasCompletedTutorial: false,
    hasJoinedChannel: false,
  };
}

/** Re-syncs a persisted `upgrades` array against the current UPGRADE_BLUEPRINTS list, run on
 * every rehydrate. Without this, a save made before an upgrade was added or retired keeps
 * showing whatever it had at save time forever — `createStartingUpgrades` only ever runs for
 * a brand-new store, never for an existing one. Retiring an id here only drops it from this
 * list; any stat boost it already granted (scrapPerSecond, maxEnergy, ...) stays intact,
 * since that lives directly on the player state, not derived from this array.
 *
 * Also re-derives `cost`/`boost`/`name` for upgrades the save already has, from the *current*
 * blueprint + the persisted `owned` count — a balance pass that changes an existing
 * upgrade's numbers (not just adds a new one) would otherwise never reach a save that already
 * has that upgrade recorded, since it'd keep whatever cost/boost was persisted at purchase
 * time forever. `owned` itself, and whatever stat boost past purchases already granted,
 * aren't touched — only the *next* purchase's price/value catches up. */
function reconcileUpgrades(upgrades: Upgrade[]): Upgrade[] {
  const blueprintById = new Map<string, (typeof UPGRADE_BLUEPRINTS)[number]>(
    UPGRADE_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint]),
  );
  const kept = upgrades
    .filter((upgrade) => blueprintById.has(upgrade.id))
    .map((upgrade) => {
      const blueprint = blueprintById.get(upgrade.id)!;
      return {
        ...upgrade,
        name: blueprint.name,
        effect: blueprint.effect,
        boost: blueprint.boost,
        cost: Math.round(blueprint.baseCost * ECONOMY.UPGRADE_COST_MULTIPLIER ** upgrade.owned),
      };
    });
  const keptIds = new Set(kept.map((upgrade) => upgrade.id));
  const added = UPGRADE_BLUEPRINTS.filter((blueprint) => !keptIds.has(blueprint.id)).map(
    (blueprint) => ({
      id: blueprint.id,
      name: blueprint.name,
      cost: blueprint.baseCost,
      effect: blueprint.effect,
      boost: blueprint.boost,
      owned: 0,
    }),
  );
  return [...kept, ...added];
}

/** Prepends a new $NEON transaction record and caps the log at NEON_HISTORY_MAX_ENTRIES, so
 * the Profile screen's History tab always has something to read without the save growing
 * unbounded. */
function withNeonTransaction(
  history: NeonTransaction[],
  label: string,
  amount: number,
): NeonTransaction[] {
  const entry: NeonTransaction = { id: crypto.randomUUID(), label, amount, timestamp: Date.now() };
  return [entry, ...history].slice(0, ECONOMY.NEON_HISTORY_MAX_ENTRIES);
}

/** Applies however many whole ENERGY_REGEN_INTERVAL_SECONDS chunks have elapsed since the
 * last regen tick, advancing the regen clock by exactly that much (not to `now`) so the
 * countdown stays phase-aligned instead of drifting. Left untouched while already at
 * `maxEnergy`, so spending energy later starts the countdown fresh from that moment. */
function applyEnergyRegen(
  energy: number,
  maxEnergy: number,
  lastEnergyRegenAt: number,
  now: number,
): { energy: number; lastEnergyRegenAt: number } {
  if (energy >= maxEnergy) return { energy, lastEnergyRegenAt };
  const intervalMs = ECONOMY.ENERGY_REGEN_INTERVAL_SECONDS * 1000;
  const elapsedMs = now - lastEnergyRegenAt;
  const ticks = Math.floor(elapsedMs / intervalMs);
  if (ticks <= 0) return { energy, lastEnergyRegenAt };
  return {
    energy: Math.min(maxEnergy, energy + ticks * ECONOMY.ENERGY_REGEN_AMOUNT),
    lastEnergyRegenAt: lastEnergyRegenAt + ticks * intervalMs,
  };
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...createInitialPlayerState(),

      tick: () => {
        const now = Date.now();
        const { lastSaved } = get();
        const deltaTime = now - lastSaved; // ms
        if (deltaTime <= 0) return;

        set((state) => {
          const regen = applyEnergyRegen(state.energy, state.maxEnergy, state.lastEnergyRegenAt, now);
          const earnedScrap = getBoostedScrapEarned(
            state.scrapPerSecond,
            lastSaved,
            now,
            state.boostEndsAt,
          );
          return {
            scrap: state.scrap + earnedScrap,
            energy: regen.energy,
            lastEnergyRegenAt: regen.lastEnergyRegenAt,
            lastSaved: now,
          };
        });
      },

      addScrap: (amount) => set((state) => ({ scrap: state.scrap + amount })),

      spendScrap: (amount) => {
        if (get().scrap < amount) return false;
        set((state) => ({ scrap: state.scrap - amount }));
        return true;
      },

      addNeon: (amount, label = 'Neon Earned') =>
        set((state) => ({
          neon: state.neon + amount,
          neonHistory: withNeonTransaction(state.neonHistory, label, amount),
        })),

      spendNeon: (amount, label = 'Neon Spent') => {
        if (get().neon < amount) return false;
        set((state) => ({
          neon: state.neon - amount,
          neonHistory: withNeonTransaction(state.neonHistory, label, -amount),
        }));
        return true;
      },

      buyPart: () => {
        const { inventory, scrap, carTier, partsPurchased } = get();
        const emptyIndex = inventory.findIndex((slot) => slot === null);
        const cost = getPartBuyCost(carTier, partsPurchased);
        if (emptyIndex === -1 || scrap < cost) return false;

        set((state) => {
          const nextInventory = [...state.inventory];
          nextInventory[emptyIndex] = createPart(1);
          return {
            inventory: nextInventory,
            scrap: state.scrap - cost,
            partsPurchased: state.partsPurchased + 1,
          };
        });
        return true;
      },

      movePart: (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        set((state) => {
          const nextInventory = [...state.inventory];
          const temp = nextInventory[toIndex];
          nextInventory[toIndex] = nextInventory[fromIndex];
          nextInventory[fromIndex] = temp;
          return { inventory: nextInventory };
        });
      },

      mergeParts: (draggedIndex, targetIndex) => {
        if (draggedIndex === targetIndex) return null;
        const { inventory, energy, installedUpgrades, pendingCalibrationPart } = get();
        const dragged = inventory[draggedIndex];
        const target = inventory[targetIndex];
        if (!dragged || !target) return null;
        if (dragged.level !== target.level || dragged.level >= ECONOMY.MAX_PART_LEVEL) {
          return null;
        }
        if (energy < ECONOMY.MERGE_ENERGY_COST) return null;

        const isCrit = Math.random() < ECONOMY.MERGE_CRIT_CHANCE;
        const newLevel = Math.min(
          ECONOMY.MAX_PART_LEVEL,
          dragged.level + (isCrit ? 2 : 1),
        );

        let merged: Part;
        if (newLevel >= ECONOMY.MAX_PART_LEVEL) {
          // A brand-new Lv.4 part needs a perk that isn't already installed or already
          // sitting on another Lv.4 part in play, so all 3 upgrade slots stay reachable.
          const usedPerks = [
            ...installedUpgrades,
            ...inventory.flatMap((part) => (part?.perk ? [part.perk] : [])),
            ...(pendingCalibrationPart?.perk ? [pendingCalibrationPart.perk] : []),
          ];
          merged = createPart(newLevel, usedPerks);
        } else {
          merged = createPart(newLevel);
        }

        if (isCrit) {
          console.log(
            `[Garage] Merge crit! Jumped straight to Lv.${newLevel} (${merged.name}).`,
          );
        }

        set((state) => {
          const nextInventory = [...state.inventory];
          nextInventory[draggedIndex] = null;
          nextInventory[targetIndex] = merged;
          // Spending energy while at the cap is what starts the 5-minute regen countdown —
          // if it was already ticking down (energy already below cap), leave it alone so
          // repeated merges can't keep resetting the timer and blocking regen forever.
          const wasFull = state.energy >= state.maxEnergy;
          return {
            inventory: nextInventory,
            energy: state.energy - ECONOMY.MERGE_ENERGY_COST,
            lastEnergyRegenAt: wasFull ? Date.now() : state.lastEnergyRegenAt,
          };
        });
        return { part: merged, isCrit };
      },

      startCalibration: (partIndex) => {
        const { inventory, pendingCalibrationPart } = get();
        if (pendingCalibrationPart) return;
        const part = inventory[partIndex];
        if (!part || part.level < ECONOMY.MAX_PART_LEVEL) return;

        set((state) => {
          const nextInventory = [...state.inventory];
          nextInventory[partIndex] = null;
          return { inventory: nextInventory, pendingCalibrationPart: part };
        });
      },

      completeCalibration: (success) => {
        const { pendingCalibrationPart } = get();
        if (!pendingCalibrationPart) return;

        if (success) {
          const perk = pendingCalibrationPart.perk;
          set((state) => {
            const installedUpgrades = perk
              ? [...state.installedUpgrades, perk]
              : state.installedUpgrades;
            // Every successful install multiplies scrapPerSecond by this regardless of
            // which perk was rolled, on top of that perk's own specific effect below —
            // multiplicative so income keeps pace with the tier-over-tier part-price growth
            // (see CALIBRATION_SCRAP_PER_SECOND_GROWTH's doc in economy.ts).
            const scrapPerSecond =
              state.scrapPerSecond * (1 + ECONOMY.CALIBRATION_SCRAP_PER_SECOND_GROWTH);

            if (perk === 'Quantum Injector') {
              return {
                pendingCalibrationPart: null,
                installedUpgrades,
                scrapPerSecond: scrapPerSecond + ECONOMY.QUANTUM_INJECTOR_SCRAP_PER_SECOND,
              };
            }
            if (perk === 'Neuro-Optimizer') {
              return {
                pendingCalibrationPart: null,
                installedUpgrades,
                scrapPerSecond,
                critChance: state.critChance + ECONOMY.NEURO_OPTIMIZER_CRIT_CHANCE_BOOST,
              };
            }
            // Syndicate Transponder has no direct stat mutation of its own beyond the flat
            // boost above — its Durability/Handling race-stat boost is derived on demand
            // from installedUpgrades by getCarStats().
            return { pendingCalibrationPart: null, installedUpgrades, scrapPerSecond };
          });
          return;
        }

        set((state) => {
          const emptyIndex = state.inventory.findIndex((slot) => slot === null);
          const nextInventory = [...state.inventory];
          if (emptyIndex !== -1) nextInventory[emptyIndex] = pendingCalibrationPart;
          return { inventory: nextInventory, pendingCalibrationPart: null };
        });
      },

      handleTap: () => {
        const { scrapPerClick, critChance, critMultiplier } = get();
        const isCrit = Math.random() < critChance;
        const amount = isCrit ? scrapPerClick * critMultiplier : scrapPerClick;
        set((state) => ({ scrap: state.scrap + amount }));
        return { isCrit, amount };
      },

      buyUpgrade: (id) => {
        const { upgrades, scrap } = get();
        const upgrade = upgrades.find((u) => u.id === id);
        if (!upgrade || scrap < upgrade.cost) return false;

        set((state) => ({
          scrap: state.scrap - upgrade.cost,
          ...(upgrade.effect === 'scrapPerSecond' && {
            scrapPerSecond: state.scrapPerSecond + upgrade.boost,
          }),
          ...(upgrade.effect === 'scrapPerClick' && {
            scrapPerClick: state.scrapPerClick + upgrade.boost,
          }),
          ...(upgrade.effect === 'maxEnergy' && {
            maxEnergy: state.maxEnergy + upgrade.boost,
          }),
          upgrades: state.upgrades.map((u) =>
            u.id === id
              ? {
                  ...u,
                  owned: u.owned + 1,
                  cost: Math.round(u.cost * ECONOMY.UPGRADE_COST_MULTIPLIER),
                }
              : u,
          ),
        }));
        return true;
      },

      tradeInCar: () => {
        const { installedUpgrades, carTier } = get();
        if (installedUpgrades.length < getUpgradeRequirement(carTier)) return;

        const newTier = carTier + 1;
        set((state) => ({
          installedUpgrades: [],
          partsPurchased: 0,
          carTier: newTier,
          car: { ...state.car, name: getCarTier(newTier).name },
          scrapPerSecond: state.scrapPerSecond * (1 + ECONOMY.TRADE_IN_SCRAP_PER_SECOND_GROWTH),
        }));
        trackCarUpgraded(newTier);
        if (newTier === REFERRAL.MILESTONE_CAR_TIER) {
          // Silently in the background — but no optimistic local credit here: whether this
          // account gets anything at all depends entirely on whether it was actually invited by
          // someone (see referrals.mts's handleMilestoneReached), which only the backend's
          // referral-links record knows. creditReferralMilestoneReward applies exactly whatever
          // the server reports back, including "nothing" for an organic, unreferred Tier-5.
          notifyReferralMilestone(newTier)
            .then((result) => get().creditReferralMilestoneReward(result.neonCredited, result.scrapCredited))
            .catch(() => {});
        }
      },

      adminGrantNeon: (amount) => {
        if (!isAdminAccount() || !Number.isFinite(amount) || amount <= 0) return;
        set((state) => ({
          neon: state.neon + amount,
          neonHistory: withNeonTransaction(state.neonHistory, 'Admin Grant', amount),
        }));
      },

      adminGrantScrap: (amount) => {
        if (!isAdminAccount() || !Number.isFinite(amount) || amount <= 0) return;
        set((state) => ({ scrap: state.scrap + amount }));
      },

      adminNextCar: () => {
        if (!isAdminAccount()) return;
        set((state) => {
          const nextTier = Math.min(state.carTier + 1, CAR_TIERS.length);
          return { carTier: nextTier, car: { ...state.car, name: getCarTier(nextTier).name } };
        });
      },

      adminPrevCar: () => {
        if (!isAdminAccount()) return;
        set((state) => {
          const prevTier = Math.max(state.carTier - 1, 1);
          return { carTier: prevTier, car: { ...state.car, name: getCarTier(prevTier).name } };
        });
      },

      applyOfflineProgress: () => {
        const now = Date.now();

        // Re-syncs the car's display name to its tier's current name, so a naming/asset
        // update (e.g. adding tier art) applies even to saves made before it existed, and
        // catches up on however many 5-minute Energy ticks passed while away — both run
        // unconditionally, independent of the elapsedSeconds-gated Scrap payout below.
        set((state) => {
          const correctName = getCarTier(state.carTier).name;
          const regen = applyEnergyRegen(state.energy, state.maxEnergy, state.lastEnergyRegenAt, now);
          const isAdmin = getTelegramUserId() === ADMIN_TELEGRAM_ID;
          const isDueAdminGrant =
            isAdmin && !state.neonHistory.some((entry) => entry.label === ADMIN_GRANT_LABEL);
          const isDueAdminScrapGrant = isAdmin && !state.hasReceivedAdminScrapGrant;
          return {
            ...(correctName !== state.car.name && { car: { ...state.car, name: correctName } }),
            energy: regen.energy,
            lastEnergyRegenAt: regen.lastEnergyRegenAt,
            upgrades: reconcileUpgrades(state.upgrades),
            ...(isDueAdminGrant && {
              neon: state.neon + ADMIN_GRANT_AMOUNT,
              neonHistory: withNeonTransaction(state.neonHistory, ADMIN_GRANT_LABEL, ADMIN_GRANT_AMOUNT),
            }),
            ...(isDueAdminScrapGrant && {
              scrap: state.scrap + ADMIN_SCRAP_GRANT_AMOUNT,
              hasReceivedAdminScrapGrant: true,
            }),
          };
        });

        const { lastSaved, scrapPerSecond, boostEndsAt, megaBoostEndsAt } = get();
        // Uncapped — used only to measure how much of the AFK cap the time away actually used
        // up (see lastOfflineCapacityRatio's doc comment in types/index.ts), never to pay out
        // Scrap directly. `elapsedSeconds` below is the one that's actually capped and paid.
        const rawElapsedSeconds = Math.max(0, (now - lastSaved) / 1000);
        // A Mega Overclock (see MEGA_OVERCLOCK in economy.ts) still active at the moment this
        // device went offline raises the applicable cap for this entire gap from the normal
        // ECONOMY.MAX_OFFLINE_SECONDS to its own longer one.
        const effectiveMaxOfflineSeconds = getEffectiveMaxOfflineSeconds(megaBoostEndsAt, lastSaved);
        const offlineCapacityRatio =
          effectiveMaxOfflineSeconds > 0
            ? Math.min(1, rawElapsedSeconds / effectiveMaxOfflineSeconds)
            : 1;
        const elapsedSeconds = Math.min(rawElapsedSeconds, effectiveMaxOfflineSeconds);
        if (elapsedSeconds <= 0) {
          set({ lastSaved: now, lastOfflineCapacityRatio: offlineCapacityRatio });
          return;
        }

        // Windowed against the *capped* elapsed time (not raw lastSaved) so a save that was
        // closed far longer than MAX_OFFLINE_SECONDS still only ever earns for that capped
        // span — getBoostedScrapEarned then splits *that* span into its boosted/normal portions.
        const cappedWindowStart = now - elapsedSeconds * 1000;
        const earnedScrap = getBoostedScrapEarned(scrapPerSecond, cappedWindowStart, now, boostEndsAt);

        set((state) => ({
          scrap: state.scrap + earnedScrap,
          lastSaved: now,
          lastOfflineCapacityRatio: offlineCapacityRatio,
          offlineEarnings:
            earnedScrap >= ECONOMY.MIN_OFFLINE_EARNINGS_TO_SHOW
              ? earnedScrap
              : null,
        }));
      },

      dismissOfflineEarnings: () => set({ offlineEarnings: null }),

      hydrateFromRemote: (remoteState) => {
        set(remoteState);
        get().applyOfflineProgress();
      },

      claimDailyReward: () => {
        const { lastDailyRewardClaim, dailyRewardStreak } = get();
        const now = Date.now();
        if (!isDailyRewardClaimable(lastDailyRewardClaim, now)) return null;

        const streakBroken =
          lastDailyRewardClaim !== null &&
          now - lastDailyRewardClaim > DAILY_REWARD_STREAK_RESET_HOURS * 60 * 60 * 1000;
        const newStreak = lastDailyRewardClaim === null || streakBroken ? 1 : dailyRewardStreak + 1;
        const reward = getDailyRewardForStreak(newStreak);
        const label = `Daily Reward — Day ${reward.day}`;

        set((state) => ({
          dailyRewardStreak: newStreak,
          lastDailyRewardClaim: now,
          ...(reward.scrap ? { scrap: state.scrap + reward.scrap } : {}),
          ...(reward.neon
            ? {
                neon: state.neon + reward.neon,
                neonHistory: withNeonTransaction(state.neonHistory, label, reward.neon),
              }
            : {}),
        }));

        return reward;
      },

      exchangeNeonForScrap: (neonAmount) => {
        if (!Number.isFinite(neonAmount) || neonAmount <= 0) return false;
        if (!get().spendNeon(neonAmount, `Exchange — ${neonAmount} NEON → Scrap`)) return false;
        set((state) => ({ scrap: state.scrap + neonAmount * NEON_TO_SCRAP_RATE }));
        return true;
      },

      claimNeonSyphon: () => {
        const { lastNeonSyphonTime, carTier } = get();
        const now = Date.now();
        if (!isNeonSyphonClaimable(lastNeonSyphonTime, now)) return null;

        const amount = getNeonSyphonReward(carTier);
        set((state) => ({
          lastNeonSyphonTime: now,
          neon: state.neon + amount,
          neonHistory: withNeonTransaction(state.neonHistory, 'Neon Syphon — Passive Extraction', amount),
        }));
        return amount;
      },

      setWalletAddress: (address) => {
        const previous = get().walletAddress;
        set({ walletAddress: address });
        if (address !== null && address !== previous) trackWalletConnected(address);
      },

      recordRaceResult: (result) => {
        if (result === 'win') {
          set((state) => ({ racesWon: state.racesWon + 1 }));
        }
        trackRacePlayed(result);
      },

      claimQuest: (questId) => {
        const { claimedQuests, walletAddress, carTier, racesWon, syndicateId, validReferralsCount, hasJoinedChannel } = get();
        if (claimedQuests.includes(questId)) return false;

        const quest = QUESTS.find((q) => q.id === questId);
        if (!quest) return false;
        if (
          !isQuestComplete(questId, {
            walletAddress,
            carTier,
            racesWon,
            syndicateId,
            validReferralsCount,
            hasJoinedChannel,
          })
        ) {
          return false;
        }

        const neonReward = quest.neonReward ?? 0;
        const scrapReward = quest.scrapReward ?? 0;

        set((state) => ({
          claimedQuests: [...state.claimedQuests, questId],
          scrap: state.scrap + scrapReward,
          neon: state.neon + neonReward,
          ...(neonReward > 0
            ? {
                neonHistory: withNeonTransaction(
                  state.neonHistory,
                  `Airdrop Quest — ${quest.title}`,
                  neonReward,
                ),
              }
            : {}),
        }));
        return true;
      },

      creditBossKillReward: (bossId, amount) => {
        set((state) => ({
          lastClaimedBossId: bossId,
          neon: state.neon + amount,
          neonHistory: withNeonTransaction(
            state.neonHistory,
            'Night Siege — Boss Kill Reward',
            amount,
          ),
        }));
      },

      recordBossAttack: (timestamp) => set({ lastBossAttackTime: timestamp }),

      setSyndicateId: (syndicateId) => set({ syndicateId, lastSaved: Date.now() }),

      creditReferralMilestoneReward: (neonCredited, scrapCredited) => {
        if (neonCredited <= 0 && scrapCredited <= 0) return;
        set((state) => ({
          unclaimedNeon: state.unclaimedNeon + neonCredited,
          unclaimedScrap: state.unclaimedScrap + scrapCredited,
        }));
      },

      claimReferralRewards: (neonClaimed, scrapClaimed) => {
        if (neonClaimed <= 0 && scrapClaimed <= 0) return;
        set((state) => ({
          neon: state.neon + neonClaimed,
          scrap: state.scrap + scrapClaimed,
          unclaimedNeon: 0,
          unclaimedScrap: 0,
          ...(neonClaimed > 0 && {
            neonHistory: withNeonTransaction(state.neonHistory, 'Referral Rewards Claimed', neonClaimed),
          }),
        }));
      },

      refreshReferralsData: (data) =>
        set({
          unclaimedNeon: data.unclaimedNeon,
          unclaimedScrap: data.unclaimedScrap,
          validReferralsCount: data.validReferralsCount,
          totalReferralsCount: data.totalReferralsCount,
        }),
        
      completeTutorial: () => set({ hasCompletedTutorial: true }),
      verifyChannelSubscription: () => set({ hasJoinedChannel: true }),
    }),
    {
      name: STORAGE_KEY,
      // offlineEarnings is a one-shot UI toast, recomputed fresh each load — persisting
      // it would just make a stale "Welcome back" reappear on the next reload.
      partialize: getSyncableState,
      version: SAVE_VERSION,
      // Every save below the current SAVE_VERSION gets wiped back to a fresh start — bump
      // SAVE_VERSION whenever an economy rebalance is big enough that letting existing saves
      // keep their old-economy progress would be unfair to everyone who starts after it (this
      // one exists because a purchasable Energy Overclock upgrade let a real player reach
      // Tier 7/10 in under 12 hours; see economy.ts). The admin account is the one exception —
      // it keeps its $NEON balance/history (so the one-time admin grant below doesn't re-fire)
      // but loses car/scrap progress same as everyone else. A fresh `lastSaved: Date.now()`
      // here is also what stops the cross-device sync backend from pulling a stale pre-wipe
      // cloud save back down over this: useCloudSync only ever adopts a remote save that's
      // *newer* than local, and nothing pre-wipe can be newer than "now".
      migrate: (persistedState) => {
        const fresh = createInitialPlayerState();
        const old = persistedState as Partial<PlayerState> | undefined;
        if (old && getTelegramUserId() === ADMIN_TELEGRAM_ID) {
          return { ...fresh, neon: old.neon ?? fresh.neon, neonHistory: old.neonHistory ?? fresh.neonHistory };
        }
        return fresh;
      },
      onRehydrateStorage: () => (state) => {
        if (state) localLastSavedAtLoad = state.lastSaved;
        state?.applyOfflineProgress();
      },
    },
  ),
);

/** Strips the non-persistable parts of a GameStore snapshot (store actions aren't JSON-
 * serializable and get dropped on their own, but `offlineEarnings`/`lastOfflineCapacityRatio`
 * need an explicit exclusion) down to just the plain PlayerState fields — shared by both the
 * localStorage `partialize` above and useCloudSync's push-to-backend payload, so the two
 * storage layers can never drift into syncing different shapes. `lastOfflineCapacityRatio` is
 * reset to 0 same as `offlineEarnings` resets to null: both are recomputed fresh by
 * applyOfflineProgress() on every load/remote-hydrate, so persisting or syncing whatever value
 * happened to be sitting in memory would just be a stale number from one specific device
 * showing up somewhere it means nothing. */
export function getSyncableState(state: GameStore): PlayerState {
  const { offlineEarnings: _offlineEarnings, lastOfflineCapacityRatio: _lastOfflineCapacityRatio, ...persisted } =
    state;
  return { ...persisted, offlineEarnings: null, lastOfflineCapacityRatio: 0 };
}
