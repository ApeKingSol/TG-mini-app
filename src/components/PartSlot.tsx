import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import type { Part } from '../game/types';
import { getPartTier } from '../game/config/parts';
import { ECONOMY } from '../game/config/economy';

interface PartSlotProps {
  index: number;
  part: Part | null;
  /** True for one render right after this part was created by a successful merge, to trigger a pop/flash. */
  justMerged?: boolean;
}

export function PartSlot({ index, part, justMerged = false }: PartSlotProps) {
  // Every slot — filled or empty — is droppable at a stable `slot-{index}` id, so a
  // dragged part can always be dropped into an empty socket or merged onto an occupied
  // one. Only filled slots are draggable; the id there is the part's own id, since that's
  // what the Garage screen's onDragEnd needs to look up which part moved.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slot-${index}` });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id: part?.id ?? `empty-slot-${index}`, disabled: !part });

  const setNodeRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  if (!part) {
    return (
      <div
        ref={setNodeRef}
        className={`aspect-square rounded-xl border-2 border-dashed bg-black/40 transition-colors ${
          isOver ? 'border-neon-cyan/70 bg-neon-cyan/5' : 'border-neutral-800'
        }`}
      />
    );
  }

  const tier = getPartTier(part.level);
  const Icon = tier.icon;
  const isMaxLevel = part.level >= ECONOMY.MAX_PART_LEVEL;

  return (
    // dnd-kit owns this outer node's `transform` (drag position) via plain inline style +
    // a CSS transition, so the live drag tracks the pointer 1:1 and the snap-back on drop
    // eases smoothly. Framer Motion's scale/pop animations live on the inner node instead —
    // putting both on the same element made them fight over `transform` every frame.
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        touchAction: 'none',
        zIndex: isDragging ? 30 : undefined,
        transition: isDragging ? undefined : 'transform 200ms ease',
      }}
      className="cursor-grab select-none active:cursor-grabbing"
    >
      <motion.div
        layout
        initial={{ opacity: 0, scale: justMerged ? 0.3 : 0.5 }}
        animate={
          justMerged
            ? {
                opacity: 1,
                scale: [0.3, 1.3, 1],
                filter: ['brightness(2.2)', 'brightness(1)'],
              }
            : { opacity: 1, scale: 1, filter: 'brightness(1)' }
        }
        transition={
          justMerged ? { duration: 0.45, times: [0, 0.5, 1] } : { duration: 0.2 }
        }
        whileHover={{ scale: 1.05 }}
        className={`relative flex aspect-square flex-col items-center justify-center rounded-xl border ${tier.colorClasses} ${
          isDragging ? 'opacity-60 shadow-lg' : ''
        } ${isOver && !isDragging ? 'ring-2 ring-white/70' : ''}`}
      >
        {isMaxLevel && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-neon-cyan shadow-[0_0_6px_rgba(0,240,255,0.9)]" />
        )}
        <Icon className={`h-7 w-7 ${tier.glow}`} strokeWidth={1.75} />
        <span className="mt-1 font-display text-[10px] font-semibold tracking-wide">
          Lv.{part.level}
        </span>
      </motion.div>
    </div>
  );
}
