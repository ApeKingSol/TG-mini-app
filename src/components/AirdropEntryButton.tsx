import { Rocket } from 'lucide-react';

interface AirdropEntryButtonProps {
  onClick: () => void;
}

/** Mirrors ProfileAvatarButton on the opposite corner (left instead of right) — the Airdrop hub
 * is reached the same way Profile is: a header button, not a BottomNav tab, so BottomNav's
 * carefully-fixed 3-item layout (Scrapyard / Garage / The Streets) never has to change shape to
 * fit a 4th destination.
 *
 * z-[1001], not the plain z-10 this used to have: @tonconnect/ui-react's TonConnectButton
 * (rendered on ProfileScreen) mounts a shadow-DOM widget appended straight to document.body
 * (`#tc-widget-root`, outside our own React tree entirely) whose internal layers use z-index
 * values up to 999999 for its connect modal — but its own bundle also uses a lower `z-index:
 * 1000` for an ambient layer that appears to stay in the DOM (with pointer-events still active)
 * for as long as *any* TonConnect UI component is mounted, not just while a modal is actually
 * open. That silently ate every click on this button specifically while ProfileScreen (the only
 * screen with a TonConnectButton) was open, even though this button's own z-index never changed.
 * 1001 clears that ambient layer while staying safely below the real 999999 modal-open case, so
 * an actually-open wallet modal still correctly covers this button while it's up. */
export function AirdropEntryButton({ onClick }: AirdropEntryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Airdrop & Quests"
      className="panel-cut-sm absolute left-0 top-0 z-[1001] flex h-9 w-9 items-center justify-center border border-neon-magenta/50 bg-neon-magenta/10 text-neon-magenta"
    >
      <Rocket className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}
