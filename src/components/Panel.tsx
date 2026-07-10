import type { ReactNode } from 'react';

type PanelAccent = 'cyan' | 'magenta' | 'amber' | 'neutral';

interface PanelProps {
  children: ReactNode;
  className?: string;
  /** Small mono corner label (e.g. "SYS.ON", "NET_UPLINK", a hex id) rendered top-right — a
   * "tech greeble": it doesn't mean anything, it just reads as diagnostic HUD chrome instead
   * of decoration, the way a real cockpit readout would label an otherwise-plain panel. */
  greeble?: string;
  /** Border/greeble color — 'neutral' (default) for most cards, an accent for the ones that
   * should draw the eye (currency, active state, danger). */
  accent?: PanelAccent;
  /** panel-cut (default) for standard cards; panel-cut-sm for tightly-padded small ones —
   * see index.css, the chamfer size should roughly track the panel's own padding. */
  size?: 'md' | 'sm';
}

const ACCENT_BORDER: Record<PanelAccent, string> = {
  cyan: 'border-neon-cyan/40',
  magenta: 'border-neon-magenta/40',
  amber: 'border-amber/50',
  neutral: 'border-neutral-800',
};

const ACCENT_GREEBLE: Record<PanelAccent, string> = {
  cyan: 'text-neon-cyan/50',
  magenta: 'text-neon-magenta/50',
  amber: 'text-amber/60',
  neutral: 'text-neutral-600',
};

/** The app's standard chamfered-corner HUD card — a matte panel with sharp thin borders and
 * an optional corner greeble, replacing the old rounded-corner/soft-glow look everywhere a
 * "container" is needed. Deliberately a thin wrapper (no forced padding/layout) so it drops
 * into whatever spacing the call site already uses. */
export function Panel({ children, className = '', greeble, accent = 'neutral', size = 'md' }: PanelProps) {
  return (
    <div
      className={`relative border bg-bg-panel ${size === 'sm' ? 'panel-cut-sm' : 'panel-cut'} ${ACCENT_BORDER[accent]} ${className}`}
    >
      {greeble && (
        <span
          className={`pointer-events-none absolute right-2 top-1 select-none font-mono text-[8px] uppercase tracking-widest ${ACCENT_GREEBLE[accent]}`}
        >
          {greeble}
        </span>
      )}
      {children}
    </div>
  );
}
