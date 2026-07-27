/**
 * Lightweight, generic analytics wrapper. Every tracked event goes through `sendEvent`, which:
 *   - Silently logs to the console instead of sending anything, whenever `VITE_ANALYTICS_TOKEN`
 *     isn't set (e.g. local dev) — so this is always safe to leave wired up everywhere without
 *     spamming a real analytics project during development.
 *   - Otherwise POSTs a small JSON payload to `VITE_ANALYTICS_ENDPOINT` (defaulting to
 *     Mixpanel's event-import endpoint, but genuinely swappable for any other HTTP collector —
 *     a future Netlify Function of our own, PostHog, etc. — via that env var alone, without
 *     touching this file). The exact payload shape here is Mixpanel-compatible but not
 *     guaranteed byte-for-byte to match whichever real provider ends up behind that endpoint —
 *     verify against that provider's current ingestion docs before relying on this in
 *     production.
 *   - Never throws and never blocks the caller — a blocked/failed network request (ad-blockers
 *     commonly block analytics domains) is swallowed silently. Analytics must never be able to
 *     break the app it's instrumenting.
 *
 * Both env vars are read once at module load, `VITE_`-prefixed per this project's existing
 * convention (see .env.example) for what Vite exposes to client-side code.
 */

const ANALYTICS_TOKEN: string | undefined = import.meta.env.VITE_ANALYTICS_TOKEN;
const ANALYTICS_ENDPOINT: string =
  (import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined) ?? 'https://api.mixpanel.com/track';

function sendEvent(eventName: string, properties: Record<string, unknown> = {}): void {
  if (!ANALYTICS_TOKEN) {
    console.log('[analytics]', eventName, properties);
    return;
  }

  const payload = [
    {
      event: eventName,
      properties: {
        ...properties,
        token: ANALYTICS_TOKEN,
        time: Date.now(),
      },
    },
  ];

  fetch(ANALYTICS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    // Gives the request a chance to actually leave even if it's fired right before the page
    // unloads/backgrounds — the same reasoning as sendBeacon elsewhere in this project
    // (useCloudSync.ts), but fetch's own keepalive flag is enough for a payload this small.
    keepalive: true,
  }).catch(() => {
    // See the file-level doc comment — deliberately silent.
  });
}

export function trackAppOpened(): void {
  sendEvent('app_opened');
}

export function trackWalletConnected(walletAddress: string): void {
  sendEvent('wallet_connected', { walletAddress });
}

export function trackCarUpgraded(newTier: number): void {
  sendEvent('car_upgraded', { newTier });
}

export function trackRacePlayed(result: 'win' | 'loss'): void {
  sendEvent('race_played', { result });
}
