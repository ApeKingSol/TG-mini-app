import { Rocket } from 'lucide-react';

interface AirdropEntryButtonProps {
  onClick: () => void;
}

/** Mirrors ProfileAvatarButton on the opposite corner (left instead of right) — the Airdrop hub
 * is reached the same way Profile is: a header button, not a BottomNav tab, so BottomNav's
 * carefully-fixed 3-item layout (Scrapyard / Garage / The Streets) never has to change shape to
 * fit a 4th destination.
 *
 * Icon + a small "AIRDROP" label stacked underneath, not an icon-only glyph — a bare rocket icon
 * reads as "notifications" or "boost" just as easily as "airdrop" to a first-time player, and this
 * is the single entry point into the whole $NEON quest/TGE system, worth spelling out.
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
      className="panel-cut-sm absolute left-0 top-0 z-[1001] flex w-12 flex-col items-center gap-0.5 border border-neon-magenta/50 bg-neon-magenta/10 py-1.5 text-neon-magenta"
    >
      <Rocket className="h-4 w-4" strokeWidth={1.75} />
      <span className="font-mono text-[7px] font-bold uppercase tracking-wider leading-none">
        Airdrop
      </span>
    </button>
  );
}
