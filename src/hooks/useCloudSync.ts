import { useEffect, useRef } from 'react';
import { useGameStore, getSyncableState, localLastSavedAtLoad } from '../game/store/GameStore';
import { WebApp, isRunningInTelegram } from '../lib/telegram';
import type { PlayerState } from '../game/types';

const SYNC_ENDPOINT = '/api/sync';
/** How often local state gets pushed to the backend while the app is open. */
const PUSH_INTERVAL_MS = 10_000;
/** How often an already-open device re-checks the backend for a newer save pushed by
 * another device — without this, a device that was opened once and left sitting would
 * never notice progress made elsewhere until it was closed and reopened. */
const PULL_INTERVAL_MS = 15_000;

async function fetchRemoteState(initData: string): Promise<PlayerState | null> {
  const res = await fetch(SYNC_ENDPOINT, { headers: { 'x-telegram-init-data': initData } });
  if (!res.ok) return null;
  const body = (await res.json()) as { state: unknown };
  const remote = body.state;
  // Minimal shape guard — a malformed or future-schema blob shouldn't get force-fed into
  // hydrateFromRemote's blind `set()`.
  if (
    !remote ||
    typeof remote !== 'object' ||
    typeof (remote as PlayerState).lastSaved !== 'number' ||
    typeof (remote as PlayerState).scrap !== 'number'
  ) {
    return null;
  }
  return remote as PlayerState;
}

function pushState(initData: string, state: PlayerState): Promise<void> {
  return fetch(SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData, state }),
  }).then(() => undefined);
}

/** Best-effort push that survives the page being backgrounded/closed right as it fires. A
 * plain fetch() started inside a visibilitychange/pagehide handler can get cut off before it
 * completes once the browser suspends the page — this was silently losing every save-on-
 * close push on iOS (which backgrounds tabs almost immediately) while happening to still
 * work on desktop, where suspension is much less aggressive. sendBeacon is what browsers
 * provide specifically to keep running past that point; the tradeoff is no custom headers,
 * which is why initData now travels in the JSON body instead of a header. */
function pushStateReliably(initData: string, state: PlayerState) {
  const payload = JSON.stringify({ initData, state });
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    if (navigator.sendBeacon(SYNC_ENDPOINT, blob)) return;
  }
  pushState(initData, state).catch(() => {});
}

/** Keeps this device's save in sync with the cross-device backend (Netlify Function +
 * Blobs, keyed by the Telegram user id proven via initData): pulls the remote save on
 * mount, on an interval, and whenever the app returns to the foreground, adopting it
 * whenever it's newer than what's already local (last-write-wins by `lastSaved`); pushes
 * local state on an interval and — reliably, via sendBeacon — whenever the app is
 * backgrounded. A no-op everywhere outside an actual Telegram client, since there's no
 * initData to authenticate a sync call with there. */
export function useCloudSync() {
  const lastPushedAtRef = useRef(0);

  useEffect(() => {
    if (!isRunningInTelegram()) return;
    const initData = WebApp.initData;
    let cancelled = false;

    const pullRemote = () => {
      fetchRemoteState(initData)
        .then((remote) => {
          if (cancelled || !remote) return;
          // Never adopt something older than what this device already knows about —
          // either from its own load-time snapshot or from its own more recent push.
          // Comparing only against the load-time snapshot (as the very first version of
          // this hook did) meant a later periodic re-pull could wrongly downgrade local
          // progress made *after* that snapshot if it happened to see a slightly stale
          // remote read.
          const localBaseline = Math.max(localLastSavedAtLoad, lastPushedAtRef.current);
          if (remote.lastSaved > localBaseline) {
            useGameStore.getState().hydrateFromRemote(remote);
          }
        })
        .catch(() => {
          // Offline, or the backend is unreachable — local play continues unaffected.
        });
    };

    const pushIfChanged = (reliable: boolean) => {
      const state = getSyncableState(useGameStore.getState());
      if (state.lastSaved === lastPushedAtRef.current) return;
      lastPushedAtRef.current = state.lastSaved;
      if (reliable) {
        pushStateReliably(initData, state);
      } else {
        pushState(initData, state).catch(() => {});
      }
    };

    pullRemote();

    const pushIntervalId = window.setInterval(() => pushIfChanged(false), PUSH_INTERVAL_MS);
    const pullIntervalId = window.setInterval(pullRemote, PULL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pushIfChanged(true);
      } else {
        pullRemote();
      }
    };
    const handlePageHide = () => pushIfChanged(true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      cancelled = true;
      window.clearInterval(pushIntervalId);
      window.clearInterval(pullIntervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);
}
