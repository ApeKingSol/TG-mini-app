import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import type { Part } from '../game/types';
import { getPartTier } from '../game/config/parts';

interface PartCardProps {
  part: Part;
  /** True for one render right after this part was created by a successful merge, to trigger a pop/flash. */
  justMerged?: boolean;
}

export function PartCard({ part, justMerged = false }: PartCardProps) {
  const tier = getPartTier(part.level);
  const Icon = tier.icon;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id: part.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: part.id });

  // A part card is both draggable (it can be picked up) and droppable (another
  // card can be merged onto it), so both dnd-kit refs point at the same node.
  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    // dnd-kit owns this outer node's `transform` (drag position) via plain inline
    // style + a CSS transition, so the live drag tracks the pointer 1:1 and the
    // snap-back on drop eases smoothly. Framer Motion's scale/pop animations live on
    // the inner node instead — putting both on the same element made them fight over
    // the `transform` property every frame, which is what made dragging feel janky.
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
        exit={{ opacity: 0, scale: 0.5 }}
        transition={
          justMerged ? { duration: 0.45, times: [0, 0.5, 1] } : { duration: 0.2 }
        }
        whileHover={{ scale: 1.05 }}
        className={`flex aspect-square flex-col items-center justify-center rounded-xl border ${tier.colorClasses} ${
          isDragging ? 'opacity-60 shadow-lg' : ''
        } ${isOver && !isDragging ? 'ring-2 ring-white/70' : ''}`}
      >
        <Icon className={`h-7 w-7 ${tier.glow}`} strokeWidth={1.75} />
        <span className="mt-1 font-display text-[10px] font-semibold tracking-wide">
          {tier.name}
        </span>
      </motion.div>
    </div>
  );
}
