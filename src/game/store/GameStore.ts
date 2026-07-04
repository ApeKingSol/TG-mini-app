import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ECONOMY, UPGRADE_BLUEPRINTS } from '../config/economy';
import type {
  CarHpStatus,
  CarState,
  Part,
  PartKind,
  PlayerState,
  Upgrade,
} from '../types';

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
  addPart: (kind: PartKind, level?: number) => void;
  /** Merges two parts of the same kind/level into one of the next level. Returns the new part on success, or null if the pair is invalid (caller should snap the dragged part back). */
  mergeParts: (draggedId: string, targetId: string) => Part | null;
  /** Spends 1 Energy for Scrap (possibly a critical hit). Returns null if Energy is empty. */
  handleTap: () => { isCrit: boolean; amount: number } | null;
  /** Returns false without charging if the player can't afford this upgrade's current cost. */
  buyUpgrade: (id: string) => boolean;
  /** Fast-forwards Scrap/Energy for time elapsed since lastSaved, run once after the persisted save is rehydrated. */
  applyOfflineProgress: () => void;
  dismissOfflineEarnings: () => void;
  /** Adds any upgrade blueprints missing from a persisted save (e.g. ones introduced in a later update), without touching existing progress. */
  reconcileUpgrades: () => void;
  /** Activates (or refreshes) the Overclock Boost for the given duration. */
  activateBoost: (durationInSeconds: number) => void;
}

type GameStore = PlayerState & GameActions;

function createStartingCar(): CarState {
  return {
    id: 'starter-rustbucket',
    name: 'Rustbucket Mk I',
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

function createPart(kind: PartKind, level: number): Part {
  return { id: crypto.randomUUID(), kind, level };
}

function createStartingParts(): Part[] {
  return Array.from({ length: ECONOMY.STARTING_PARTS_COUNT }, () =>
    createPart('gear', 1),
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

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      scrap: ECONOMY.STARTING_SCRAP,
      neon: ECONOMY.STARTING_NEON,
      car: createStartingCar(),
      parts: createStartingParts(),
      scrapPerClick: ECONOMY.STARTING_SCRAP_PER_CLICK,
      scrapPerSecond: ECONOMY.STARTING_SCRAP_PER_SECOND,
      upgrades: createStartingUpgrades(),
      maxEnergy: ECONOMY.STARTING_MAX_ENERGY,
      currentEnergy: ECONOMY.STARTING_MAX_ENERGY,
      energyRegenRate: ECONOMY.ENERGY_REGEN_PER_SECOND,
      critChance: ECONOMY.STARTING_CRIT_CHANCE,
      critMultiplier: ECONOMY.STARTING_CRIT_MULTIPLIER,
      isBoostActive: false,
      boostTimeLeft: 0,
      offlineEarnings: null,
      lastSaved: Date.now(),

      tick: () => {
        const now = Date.now();
        const { lastSaved, maxEnergy } = get();
        const deltaTime = now - lastSaved; // ms
        if (deltaTime <= 0) return;
        const deltaSeconds = deltaTime / 1000;

        set((state) => {
          const energyToAdd = state.energyRegenRate * deltaSeconds;
          const multiplier = state.isBoostActive ? ECONOMY.OVERCLOCK_MULTIPLIER : 1;
          const newBoostTimeLeft = Math.max(0, state.boostTimeLeft - deltaSeconds);
          return {
            scrap: state.scrap + state.scrapPerSecond * deltaSeconds * multiplier,
            currentEnergy: Math.min(
              maxEnergy,
              Math.max(0, state.currentEnergy + energyToAdd),
            ),
            boostTimeLeft: newBoostTimeLeft,
            isBoostActive: newBoostTimeLeft > 0,
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

      addPart: (kind, level = 1) =>
        set((state) => ({ parts: [...state.parts, createPart(kind, level)] })),

      mergeParts: (draggedId, targetId) => {
        if (draggedId === targetId) return null;
        const { parts } = get();
        const dragged = parts.find((p) => p.id === draggedId);
        const target = parts.find((p) => p.id === targetId);
        if (!dragged || !target) return null;
        if (dragged.kind !== target.kind || dragged.level !== target.level) {
          return null;
        }

        const merged = createPart(dragged.kind, dragged.level + 1);
        set((state) => ({
          parts: [
            ...state.parts.filter((p) => p.id !== draggedId && p.id !== targetId),
            merged,
          ],
        }));
        return merged;
      },

      handleTap: () => {
        const { currentEnergy, scrapPerClick, critChance, critMultiplier } = get();
        if (currentEnergy <= 0) return null;

        const isCrit = Math.random() < critChance;
        const amount = isCrit ? scrapPerClick * critMultiplier : scrapPerClick;

        set((state) => ({
          scrap: state.scrap + amount,
          currentEnergy: Math.max(
            0,
            state.currentEnergy - ECONOMY.ENERGY_COST_PER_TAP,
          ),
        }));
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

      applyOfflineProgress: () => {
        const now = Date.now();
        const { lastSaved, scrapPerSecond, energyRegenRate, maxEnergy, boostTimeLeft } =
          get();
        const elapsedSeconds = Math.min(
          Math.max(0, (now - lastSaved) / 1000),
          ECONOMY.MAX_OFFLINE_SECONDS,
        );
        if (elapsedSeconds <= 0) {
          set({ lastSaved: now });
          return;
        }

        // Prorate: only the portion of the offline gap that fell before the boost
        // expired earns the 2x multiplier, the rest earns the normal rate.
        const boostSeconds = Math.min(elapsedSeconds, boostTimeLeft);
        const normalSeconds = elapsedSeconds - boostSeconds;
        const earnedScrap =
          boostSeconds * scrapPerSecond * ECONOMY.OVERCLOCK_MULTIPLIER +
          normalSeconds * scrapPerSecond;
        const newBoostTimeLeft = Math.max(0, boostTimeLeft - elapsedSeconds);

        set((state) => ({
          scrap: state.scrap + earnedScrap,
          currentEnergy: Math.min(
            maxEnergy,
            Math.max(0, state.currentEnergy + elapsedSeconds * energyRegenRate),
          ),
          lastSaved: now,
          boostTimeLeft: newBoostTimeLeft,
          isBoostActive: newBoostTimeLeft > 0,
          offlineEarnings:
            earnedScrap >= ECONOMY.MIN_OFFLINE_EARNINGS_TO_SHOW
              ? earnedScrap
              : null,
        }));
      },

      dismissOfflineEarnings: () => set({ offlineEarnings: null }),

      reconcileUpgrades: () => {
        set((state) => {
          const blueprintById = new Map<string, (typeof UPGRADE_BLUEPRINTS)[number]>(
            UPGRADE_BLUEPRINTS.map((blueprint) => [blueprint.id, blueprint]),
          );

          // Drop upgrades that were retired from the blueprint (e.g. Magnetic Harvester),
          // and re-sync static metadata (name/effect/boost) for the rest so a balance
          // patch applies even to saves made before that blueprint existed — only
          // `cost`/`owned` (actual player progress) come from the save. Any stat boost a
          // retired upgrade already granted stays intact, since it lives in scrapPerSecond
          // etc. directly, not derived from this array.
          const migrated = state.upgrades
            .filter((upgrade) => blueprintById.has(upgrade.id))
            .map((upgrade) => {
              const blueprint = blueprintById.get(upgrade.id)!;
              return {
                ...upgrade,
                name: blueprint.name,
                effect: blueprint.effect,
                boost: blueprint.boost,
              };
            });

          const existingIds = new Set(migrated.map((u) => u.id));
          const missing = UPGRADE_BLUEPRINTS.filter(
            (blueprint) => !existingIds.has(blueprint.id),
          ).map((blueprint) => ({
            id: blueprint.id,
            name: blueprint.name,
            cost: blueprint.baseCost,
            effect: blueprint.effect,
            boost: blueprint.boost,
            owned: 0,
          }));

          return { upgrades: [...migrated, ...missing] };
        });
      },

      activateBoost: (durationInSeconds) =>
        set({ isBoostActive: true, boostTimeLeft: durationInSeconds }),
    }),
    {
      name: 'cyber-garage-save',
      // offlineEarnings is a one-shot UI toast, recomputed fresh each load — persisting
      // it would just make a stale "Welcome back" reappear on the next reload.
      partialize: (state) => {
        const { offlineEarnings: _offlineEarnings, ...persisted } = state;
        return persisted;
      },
      onRehydrateStorage: () => (state) => {
        state?.reconcileUpgrades();
        state?.applyOfflineProgress();
      },
    },
  ),
);
