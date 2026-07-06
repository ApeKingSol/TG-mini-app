import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ECONOMY, getPartBuyCost } from '../config/economy';
import { getPartTier, rollPartPerk, type PartPerk } from '../config/parts';
import { getCarTier } from '../config/carTiers';
import type { CarHpStatus, CarState, Part, PlayerState } from '../types';

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
  damageCar: (amount: number) => void;
  repairCar: (amount: number) => void;
  getCarHpStatus: () => CarHpStatus;
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
  /** Once all 3 upgrade slots are filled, resets `installedUpgrades` and advances to the next car tier. No-op otherwise. */
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
    hp: ECONOMY.STARTING_CAR_MAX_HP,
    maxHp: ECONOMY.STARTING_CAR_MAX_HP,
  };
}

function hpToStatus(hp: number, maxHp: number): CarHpStatus {
  const ratio = maxHp === 0 ? 0 : hp / maxHp;
  if (ratio > 0.66) return 'green';
  if (ratio > 0.33) return 'yellow';
  return 'red';
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

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      scrap: ECONOMY.STARTING_SCRAP,
      neon: ECONOMY.STARTING_NEON,
      car: createStartingCar(),
      carTier: 1,
      inventory: createStartingInventory(),
      totalPartsBought: 0,
      energy: ECONOMY.MAX_ENERGY,
      pendingCalibrationPart: null,
      installedUpgrades: [],
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

        set((state) => ({
          scrap: state.scrap + state.scrapPerSecond * deltaSeconds,
          energy: Math.min(
            ECONOMY.MAX_ENERGY,
            state.energy + ECONOMY.ENERGY_REGEN_PER_SECOND * deltaSeconds,
          ),
          lastSaved: now,
        }));
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

      damageCar: (amount) =>
        set((state) => ({
          car: { ...state.car, hp: Math.max(0, state.car.hp - amount) },
        })),

      repairCar: (amount) =>
        set((state) => ({
          car: {
            ...state.car,
            hp: Math.min(state.car.maxHp, state.car.hp + amount),
          },
        })),

      getCarHpStatus: () => {
        const { hp, maxHp } = get().car;
        return hpToStatus(hp, maxHp);
      },

      buyPart: () => {
        const { inventory, scrap, totalPartsBought } = get();
        const emptyIndex = inventory.findIndex((slot) => slot === null);
        const cost = getPartBuyCost(totalPartsBought);
        if (emptyIndex === -1 || scrap < cost) return false;

        set((state) => {
          const nextInventory = [...state.inventory];
          nextInventory[emptyIndex] = createPart(1);
          return {
            inventory: nextInventory,
            scrap: state.scrap - cost,
            totalPartsBought: state.totalPartsBought + 1,
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
          return {
            inventory: nextInventory,
            energy: state.energy - ECONOMY.MERGE_ENERGY_COST,
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
            if (perk === 'Syndicate Transponder') {
              const boost = ECONOMY.SYNDICATE_TRANSPONDER_MAX_HP_BOOST;
              return {
                pendingCalibrationPart: null,
                installedUpgrades,
                car: {
                  ...state.car,
                  maxHp: state.car.maxHp + boost,
                  hp: state.car.hp + boost,
                },
              };
            }
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

      tradeInCar: () => {
        const { installedUpgrades, carTier } = get();
        if (installedUpgrades.length < 3) return;

        set((state) => ({
          installedUpgrades: [],
          carTier: state.carTier + 1,
          car: { ...state.car, name: getCarTier(carTier + 1).name },
        }));
      },

      applyOfflineProgress: () => {
        // Re-syncs the car's display name to its tier's current name, so a naming/asset
        // update (e.g. adding tier art) applies even to saves made before it existed.
        set((state) => {
          const correctName = getCarTier(state.carTier).name;
          return correctName === state.car.name
            ? {}
            : { car: { ...state.car, name: correctName } };
        });

        const now = Date.now();
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
          energy: Math.min(
            ECONOMY.MAX_ENERGY,
            state.energy + elapsedSeconds * ECONOMY.ENERGY_REGEN_PER_SECOND,
          ),
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
