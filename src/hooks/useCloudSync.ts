import { useEffect, useRef, useState } from 'react';
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

/** Surfaced to the Profile screen so sync problems are actually observable instead of a
 * silent background process nobody (including us, debugging remotely) can see into. */
export interface CloudSyncStatus {
  /** False outside an actual Telegram client — there's no initData to sync with there. */
  enabled: boolean;
  lastPullAt: number | null;
  lastPullOk: boolean | null;
  lastPushAt: number | null;
  lastPushOk: boolean | null;
  lastError: string | null;
  /** Scrap value from the most recent successful pull — a quick "does the backend actually
   * have different numbers than what I see locally" check, directly in the UI. */
  remoteScrapAtLastPull: number | null;
}

const initialStatus: CloudSyncStatus = {
  enabled: false,
  lastPullAt: null,
  lastPullOk: null,
  lastPushAt: null,
  lastPushOk: null,
  lastError: null,
  remoteScrapAtLastPull: null,
};

async function fetchRemoteState(initData: string): Promise<PlayerState | null> {
  const res = await fetch(SYNC_ENDPOINT, { headers: { 'x-telegram-init-data': initData } });
  if (!res.ok) throw new Error(`GET /api/sync -> ${res.status}`);
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

async function pushState(initData: string, state: PlayerState): Promise<void> {
  const res = await fetch(SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData, state }),
  });
  if (!res.ok) throw new Error(`POST /api/sync -> ${res.status}`);
}

/** Best-effort push that survives the page being backgrounded/closed right as it fires. A
 * plain fetch() started inside a visibilitychange/pagehide handler can get cut off before it
 * completes once the browser suspends the page — this was silently losing every save-on-
 * close push on iOS (which backgrounds tabs almost immediately) while happening to still
 * work on desktop, where suspension is much less aggressive. sendBeacon is what browsers
 * provide specifically to keep running past that point; the tradeoff is no custom headers,
 * which is why initData now travels in the JSON body instead of a header. There's no
 * delivery confirmation for a beacon (the browser only reports whether it was *queued*), so
 * this path doesn't feed the visible status the way pullRemote/pushState do. */
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
 * initData to authenticate a sync call with there. Returns a status object (for a visible
 * indicator in the Profile screen) and a manual `syncNow` trigger. */
export function useCloudSync(): { status: CloudSyncStatus; syncNow: () => void } {
  const [status, setStatus] = useState<CloudSyncStatus>(initialStatus);
  const lastPushedAtRef = useRef(0);
  const pullRemoteRef = useRef<() => void>(() => {});
  const pushIfChangedRef = useRef<(reliable: boolean) => void>(() => {});

  useEffect(() => {
    if (!isRunningInTelegram()) return;
    setStatus((s) => ({ ...s, enabled: true }));
    const initData = WebApp.initData;
    let cancelled = false;

    const pullRemote = () => {
      fetchRemoteState(initData)
        .then((remote) => {
          if (cancelled) return;
          setStatus((s) => ({
            ...s,
            lastPullAt: Date.now(),
            lastPullOk: true,
            lastError: null,
            remoteScrapAtLastPull: remote ? remote.scrap : s.remoteScrapAtLastPull,
          }));
          if (!remote) return;
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
        .catch((err: unknown) => {
          if (cancelled) return;
          setStatus((s) => ({
            ...s,
            lastPullAt: Date.now(),
            lastPullOk: false,
            lastError: err instanceof Error ? err.message : String(err),
          }));
        });
    };

    const pushIfChanged = (reliable: boolean) => {
      const state = getSyncableState(useGameStore.getState());
      if (state.lastSaved === lastPushedAtRef.current) return;
      lastPushedAtRef.current = state.lastSaved;
      if (reliable) {
        pushStateReliably(initData, state);
        return;
      }
      pushState(initData, state)
        .then(() => {
          if (cancelled) return;
          setStatus((s) => ({ ...s, lastPushAt: Date.now(), lastPushOk: true, lastError: null }));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setStatus((s) => ({
            ...s,
            lastPushAt: Date.now(),
            lastPushOk: false,
            lastError: err instanceof Error ? err.message : String(err),
          }));
        });
    };

    pullRemoteRef.current = pullRemote;
    pushIfChangedRef.current = pushIfChanged;

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

  const syncNow = () => {
    pullRemoteRef.current();
    // Force a push regardless of whether `lastSaved` looks unchanged, so "Sync Now" always
    // does something visible rather than silently no-op'ing on the `lastPushedAtRef` guard.
    lastPushedAtRef.current = -1;
    pushIfChangedRef.current(false);
  };

  return { status, syncNow };
}
