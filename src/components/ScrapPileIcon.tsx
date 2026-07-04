interface ScrapPileIconProps {
  className?: string;
}

/** A hand-drawn cyberpunk junk heap — jagged scrap shards, a broken gear, and a glowing exposed wire. */
export function ScrapPileIcon({ className }: ScrapPileIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Back jagged scrap shard */}
      <path
        d="M2 20L4 10L7 13L9 7L12 12L15 6L18 11L21 9L22 20Z"
        className="fill-cyan-900/40 stroke-cyan-400"
        strokeWidth={1.3}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Overlapping front shard for depth */}
      <path
        d="M3 20L6 15L9.5 17L11.5 13L14 16L17 12.5L19.5 15L20.5 20Z"
        className="fill-cyan-800/40 stroke-cyan-300"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Broken gear jutting out of the pile, missing two teeth */}
      <g className="stroke-cyan-200" strokeWidth={1} strokeLinecap="round" fill="none">
        <circle cx="16" cy="15.5" r="2" />
        <path d="M16 13.1V12" />
        <path d="M17.7 14.2L18.6 13.6" />
        <path d="M17.7 16.8L18.6 17.4" />
        <path d="M14.3 16.8L13.4 17.4" />
      </g>
      <circle cx="16" cy="15.5" r="0.6" className="fill-cyan-200" />
      {/* Glowing exposed wire snaking out of the heap */}
      <path
        d="M6.5 20C6.5 17 8.5 17 8 14C7.6 11.5 6 12 6.5 8.5"
        className="stroke-cyan-300"
        strokeWidth={1.1}
        strokeLinecap="round"
        fill="none"
      />
      <circle
        cx="6.6"
        cy="8"
        r="1"
        className="fill-cyan-300 drop-shadow-[0_0_4px_rgba(103,232,249,0.9)]"
      />
    </svg>
  );
}
