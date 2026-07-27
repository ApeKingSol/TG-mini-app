import { Rocket } from 'lucide-react';

interface AirdropEntryButtonProps {
  onClick: () => void;
}

/** Mirrors ProfileAvatarButton on the opposite corner (left instead of right) — the Airdrop hub
 * is reached the same way Profile is: a header button, not a BottomNav tab, so BottomNav's
 * carefully-fixed 3-item layout (Scrapyard / Garage / The Streets) never has to change shape to
 * fit a 4th destination. */
export function AirdropEntryButton({ onClick }: AirdropEntryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Airdrop & Quests"
      className="panel-cut-sm absolute left-0 top-0 z-10 flex h-9 w-9 items-center justify-center border border-neon-magenta/50 bg-neon-magenta/10 text-neon-magenta"
    >
      <Rocket className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}
