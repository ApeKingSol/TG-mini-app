import { useEffect, useRef } from 'react';
import { useGameStore, getSyncableState } from '../game/store/GameStore';
import { WebApp, isRunningInTelegram } from '../lib/telegram';
import type { PlayerState } from '../game/types';

const SYNC_ENDPOINT = '/api/sync';
/** How often local state gets pushed to the backend while the app is open — frequent enough
 * that a second device picks up progress within half a minute, infrequent enough not to spam
 * the sync function on every single scrap tick. */
const PUSH_INTERVAL_MS = 30_000;

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
    headers: { 'content-type': 'application/json', 'x-telegram-init-data': initData },
    body: JSON.stringify(state),
  }).then(() => undefined);
}

/** Keeps this device's save in sync with the cross-device backend (Netlify Function +
 * Blobs, keyed by the Telegram user id proven via initData): pulls the remote save once on
 * mount and adopts it if it's newer than what's already local (last-write-wins by
 * `lastSaved`), then periodically pushes local state so other devices can pick it up. A
 * no-op everywhere outside an actual Telegram client, since there's no initData to
 * authenticate a sync call with there. */
export function useCloudSync() {
  const lastPushedAtRef = useRef(0);

  useEffect(() => {
    if (!isRunningInTelegram()) return;
    const initData = WebApp.initData;
    let cancelled = false;

    fetchRemoteState(initData)
      .then((remote) => {
        if (cancelled || !remote) return;
        if (remote.lastSaved > useGameStore.getState().lastSaved) {
          useGameStore.getState().hydrateFromRemote(remote);
        }
      })
      .catch(() => {
        // Offline, or the backend is unreachable — local play continues unaffected.
      });

    const pushIfChanged = () => {
      const state = getSyncableState(useGameStore.getState());
      if (state.lastSaved === lastPushedAtRef.current) return;
      lastPushedAtRef.current = state.lastSaved;
      pushState(initData, state).catch(() => {});
    };

    const intervalId = window.setInterval(pushIfChanged, PUSH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pushIfChanged();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
