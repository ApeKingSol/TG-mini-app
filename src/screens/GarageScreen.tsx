import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useGameStore } from '../game/store/GameStore';
import { CarHpBar } from '../components/CarHpBar';
import { PartCard } from '../components/PartCard';
import { ECONOMY } from '../game/config/economy';
import type { CarHpStatus } from '../game/types';

const HP_ICON_STYLES: Record<CarHpStatus, string> = {
  green: 'text-green-400 drop-shadow-[0_0_12px_rgba(74,222,128,0.6)]',
  yellow: 'text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]',
  red: 'text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.6)]',
};

const HP_RING_STYLES: Record<CarHpStatus, string> = {
  green: 'border-green-500/40',
  yellow: 'border-yellow-500/40',
  red: 'border-red-500/40',
};

export function GarageScreen() {
  const car = useGameStore((state) => state.car);
  const scrap = useGameStore((state) => state.scrap);
  const hpStatus = useGameStore((state) => state.getCarHpStatus());
  const spendScrap = useGameStore((state) => state.spendScrap);
  const repairCar = useGameStore((state) => state.repairCar);
  const parts = useGameStore((state) => state.parts);
  const addPart = useGameStore((state) => state.addPart);
  const mergeParts = useGameStore((state) => state.mergeParts);
  const [justMergedId, setJustMergedId] = useState<string | null>(null);

  // PointerSensor alone covers mouse, touch, and pen — dnd-kit's own guidance is to
  // avoid layering a separate TouchSensor on top, since both would react to the same
  // touch input and can fight each other. `distance` lets a plain tap pass through
  // instead of starting a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const merged = mergeParts(String(active.id), String(over.id));
    if (merged) {
      setJustMergedId(merged.id);
      window.setTimeout(() => setJustMergedId(null), 500);
    }
  };

  const missingHp = car.maxHp - car.hp;
  const repairCost = missingHp * ECONOMY.REPAIR_COST_PER_HP;
  const isFullHp = missingHp === 0;
  const canAfford = scrap >= repairCost;
  const canSalvage = scrap >= ECONOMY.SALVAGE_PART_COST_SCRAP;
  const canRepair = !isFullHp && canAfford;

  const handleRepair = () => {
    if (isFullHp) return;
    if (spendScrap(repairCost)) {
      repairCar(missingHp);
    }
  };

  const handleSalvage = () => {
    if (spendScrap(ECONOMY.SALVAGE_PART_COST_SCRAP)) {
      addPart('gear', 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4 pt-4"
    >
      <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4">
        <div className="flex flex-col items-center py-2">
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-2xl border bg-black/30 ${HP_RING_STYLES[hpStatus]}`}
          >
            <Car
              className={`h-14 w-14 ${HP_ICON_STYLES[hpStatus]}`}
              strokeWidth={1.25}
            />
          </div>
          <p className="mt-3 font-display text-sm uppercase tracking-widest text-neutral-300">
            {car.name}
          </p>
        </div>

        <div className="mt-2">
          <CarHpBar car={car} status={hpStatus} />
        </div>

        <motion.button
          type="button"
          onClick={handleRepair}
          disabled={isFullHp || !canAfford}
          whileHover={canRepair ? { scale: 1.05 } : undefined}
          whileTap={canRepair ? { scale: 0.95 } : undefined}
          className="mt-4 w-full rounded-lg bg-neon-cyan/10 border border-neon-cyan/40 py-2.5 text-sm font-medium text-neon-cyan transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600"
        >
          {isFullHp
            ? 'Fully repaired'
            : `Repair (-${repairCost.toLocaleString()} Scrap)`}
        </motion.button>
        {!isFullHp && !canAfford && (
          <p className="mt-2 text-center text-xs text-red-400">
            Not enough Scrap
          </p>
        )}
      </div>

      <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-neutral-500">
            Parts
          </p>
          <motion.button
            type="button"
            onClick={handleSalvage}
            disabled={!canSalvage}
            whileHover={canSalvage ? { scale: 1.05 } : undefined}
            whileTap={canSalvage ? { scale: 0.95 } : undefined}
            className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            Salvage (-{ECONOMY.SALVAGE_PART_COST_SCRAP})
          </motion.button>
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          Drag one part onto a matching part to merge it up a tier.
        </p>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="mt-3 grid grid-cols-4 gap-3">
            <AnimatePresence>
              {parts.map((part) => (
                <PartCard
                  key={part.id}
                  part={part}
                  justMerged={part.id === justMergedId}
                />
              ))}
            </AnimatePresence>
          </div>
        </DndContext>
      </div>
    </motion.div>
  );
}
