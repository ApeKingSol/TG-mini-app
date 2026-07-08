import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ECONOMY, UPGRADE_BLUEPRINTS, getPartBuyCost } from '../config/economy';
import { getPartTier, rollPartPerk, type PartPerk } from '../config/parts';
import { getCarTier, getUpgradeRequirement } from '../config/carTiers';
import type { CarState, Part, PlayerState, Upgrade } from '../types';

const LEGACY_STORAGE_KEY = 'cyber-garage-save';

/** Reads the Telegram user id directly from `window`, defensively — this runs at module
 * load time, before React (and the `useTelegram` hook) ever mounts. */
function getTelegramUserId(): string | null {
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

interface GameActions {
  /** Advances passive Scrap generation and Energy regen based on real elapsed time since the last save. */
  tick: () => void;
  addScrap: (amount: number) => void;
  /** Returns false without charging if the player can't afford it. */
  spendScrap: (amount: number) => boolean;
  addNeon: (amount: number) => void;
  spendNeon: (amount: number) => boolean;
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
  /** Fast-forwards Scrap/Energy for time elapsed since lastSaved, run once after the persisted save is rehydrated. */
  applyOfflineProgress: () => void;
  dismissOfflineEarnings: () => void;
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

/** Re-syncs a persisted `upgrades` array against the current UPGRADE_BLUEPRINTS list, run on
 * every rehydrate. Without this, a save made before an upgrade was added or retired keeps
 * showing whatever it had at save time forever — `createStartingUpgrades` only ever runs for
 * a brand-new store, never for an existing one. Retiring an id here only drops it from this
 * list; any stat boost it already granted (scrapPerSecond, maxEnergy, ...) stays intact,
 * since that lives directly on the player state, not derived from this array. */
function reconcileUpgrades(upgrades: Upgrade[]): Upgrade[] {
  const blueprintById = new Map<string, (typeof UPGRADE_BLUEPRINTS)[number]>(
    UPGRADE_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint]),
  );
  const kept = upgrades.filter((upgrade) => blueprintById.has(upgrade.id));
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
      scrapPerClick: ECONOMY.STARTING_SCRAP_PER_CLICK,
      scrapPerSecond: ECONOMY.STARTING_SCRAP_PER_SECOND,
      critChance: ECONOMY.STARTING_CRIT_CHANCE,
      critMultiplier: ECONOMY.STARTING_CRIT_MULTIPLIER,
      offlineEarnings: null,
      lastSaved: Date.now(),

      tick: () => {
        const now = Date.now();
        const { lastSaved } = get();
        const deltaTime = now - lastSaved; // ms
        if (deltaTime <= 0) return;
        const deltaSeconds = deltaTime / 1000;

        set((state) => {
          const regen = applyEnergyRegen(state.energy, state.maxEnergy, state.lastEnergyRegenAt, now);
          return {
            scrap: state.scrap + state.scrapPerSecond * deltaSeconds,
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

      addNeon: (amount) => set((state) => ({ neon: state.neon + amount })),

      spendNeon: (amount) => {
        if (get().neon < amount) return false;
        set((state) => ({ neon: state.neon - amount }));
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

            if (perk === 'Quantum Injector') {
              return {
                pendingCalibrationPart: null,
                installedUpgrades,
                scrapPerSecond:
                  state.scrapPerSecond + ECONOMY.QUANTUM_INJECTOR_SCRAP_PER_SECOND,
              };
            }
            if (perk === 'Neuro-Optimizer') {
              return {
                pendingCalibrationPart: null,
                installedUpgrades,
                critChance: state.critChance + ECONOMY.NEURO_OPTIMIZER_CRIT_CHANCE_BOOST,
              };
            }
            // Syndicate Transponder has no direct stat mutation of its own — its Durability/
            // Handling race-stat boost is derived on demand from installedUpgrades by
            // getCarStats(), so recording the perk above is already the whole effect.
            return { pendingCalibrationPart: null, installedUpgrades };
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

        set((state) => ({
          installedUpgrades: [],
          partsPurchased: 0,
          carTier: state.carTier + 1,
          car: { ...state.car, name: getCarTier(carTier + 1).name },
        }));
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
          return {
            ...(correctName !== state.car.name && { car: { ...state.car, name: correctName } }),
            energy: regen.energy,
            lastEnergyRegenAt: regen.lastEnergyRegenAt,
            upgrades: reconcileUpgrades(state.upgrades),
          };
        });

        const { lastSaved, scrapPerSecond } = get();
        const elapsedSeconds = Math.min(
          Math.max(0, (now - lastSaved) / 1000),
          ECONOMY.MAX_OFFLINE_SECONDS,
        );
        if (elapsedSeconds <= 0) {
          set({ lastSaved: now });
          return;
        }

        const earnedScrap = elapsedSeconds * scrapPerSecond;

        set((state) => ({
          scrap: state.scrap + earnedScrap,
          lastSaved: now,
          offlineEarnings:
            earnedScrap >= ECONOMY.MIN_OFFLINE_EARNINGS_TO_SHOW
              ? earnedScrap
              : null,
        }));
      },

      dismissOfflineEarnings: () => set({ offlineEarnings: null }),
    }),
    {
      name: STORAGE_KEY,
      // offlineEarnings is a one-shot UI toast, recomputed fresh each load — persisting
      // it would just make a stale "Welcome back" reappear on the next reload.
      partialize: (state) => {
        const { offlineEarnings: _offlineEarnings, ...persisted } = state;
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        state?.applyOfflineProgress();
      },
    },
  ),
);
