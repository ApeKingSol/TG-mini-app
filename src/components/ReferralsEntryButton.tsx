import { Users } from 'lucide-react';

interface ReferralsEntryButtonProps {
  onClick: () => void;
}

/** Sits immediately right of AirdropEntryButton (`left-14`, not `left-0`) in the same header
 * row — same z-[1001]-over-TonConnect's-ambient-layer reasoning as that button and
 * ProfileAvatarButton (see AirdropEntryButton.tsx's doc comment for the full explanation of why
 * 1001 specifically matters here). Kept out of BottomNav on purpose, matching Profile/Airdrop: a
 * 4th bottom-nav tab would force Scrapyard/Garage/The Streets to reflow to fit it. */
export function ReferralsEntryButton({ onClick }: ReferralsEntryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Referrals"
      className="panel-cut-sm absolute left-14 top-0 z-[1001] flex w-12 flex-col items-center gap-0.5 border border-amber/50 bg-amber/10 py-1.5 text-amber"
    >
      <Users className="h-4 w-4" strokeWidth={1.75} />
      <span className="font-mono text-[7px] font-bold uppercase tracking-wider leading-none">
        Ref
      </span>
    </button>
  );
}
