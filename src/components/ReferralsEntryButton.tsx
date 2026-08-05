import { Users } from 'lucide-react';

interface ReferralsEntryButtonProps {
  onClick: () => void;
}

/** A full-width banner button, not an absolutely-positioned header corner icon like
 * AirdropEntryButton/ProfileAvatarButton — it used to sit at `left-14` in that same corner
 * cluster, which overlapped the centered "Cyber-Garage" title on narrower screens. Sitting in
 * normal document flow (App.tsx renders this between the header and CurrencyBar) means it can
 * never collide with that title regardless of screen width, and its full width gives the
 * Referral System — the game's main growth lever — more visual weight than a small corner icon
 * would. */
export function ReferralsEntryButton({ onClick }: ReferralsEntryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel-cut-sm mb-4 flex w-full items-center justify-center gap-1.5 border border-amber/50 bg-amber/10 py-2 font-mono text-xs font-bold uppercase tracking-widest text-amber"
    >
      <Users className="h-3.5 w-3.5" strokeWidth={2} />
      Referrals — Invite &amp; Earn
    </button>
  );
}
