import { useEffect, useRef, useState } from 'react';
import {
  useGameStore,
  getSyncableState,
  localLastSavedAtLoad,
  getHadLocalSaveAtLoad,
  getTelegramUserId
} from '../game/store/GameStore';
import { WebApp, isRunningInTelegram } from '../lib/telegram';
import { registerReferralIfNewPlayer } from '../game/mock/referralsApi';
import { fetchMySyndicate } from '../game/mock/syndicateApi';
import { supabase } from '../lib/supabase';
import type { PlayerState } from '../game/types';

const SYNC_ENDPOINT = '/api/sync';
/** How often local state gets pushed to the backend while the app is open. Kept short both
 * because Telegram's Mini App WebView appears to suspend JS execution the moment the user
 * navigates away *within Telegram* (back to the chat list, say) — not just on a real tab
 * switch or app close, leaving no reliable "about to close" signal to hook into — and because
 * this is what bounds how far "Local Scrap" can drift from "Server saw" between polls, which
 * is otherwise inherent to a polling architecture (no backend push to the *other* device
 * exists here, only each device periodically asking "anything new?"). */
const PUSH_INTERVAL_MS = 2_000;
/** How often an already-open device re-checks the backend for a newer save pushed by
 * another device — without this, a device that was opened once and left sitting would
 * never notice progress made elsewhere until it was closed and reopened. */
const PULL_INTERVAL_MS = 2_000;

/** Fields whose change means something actually *happened* (a purchase, a merge, a trade-
 * in, a race result, ...) as opposed to just idle ticking (`scrap`/`energy` drifting up
 * every second). Reference-inequality is enough to detect a change here since every reducer
 * in GameStore.ts creates a fresh array/object for a field whenever it actually changes,
 * never mutating in place. Used to push immediately after something worth not losing,
 * rather than waiting for the next scheduled interval tick that a suspended WebView might
 * not live to see. */
const SIGNIFICANT_KEYS = [
  'neon',
  'carTier',
  'partsPurchased',
  'inventory',
  'installedUpgrades',
  'upgrades',
  'pendingCalibrationPart',
  'car',
  'maxEnergy',
  'neonHistory',
  'critChance',
  'critMultiplier',
  'scrapPerClick',
  'scrapPerSecond',
  'dailyRewardStreak',
  'boostEndsAt',
  'lastNeonSyphonTime',
  'walletAddress',
  'racesWon',
  'claimedQuests',
  'lastClaimedBossId',
  'lastBossAttackTime',
  'syndicateId',
  'unclaimedNeon',
  'unclaimedScrap',
  'validReferralsCount',
] as const satisfies readonly (keyof PlayerState)[];

/** Surfaced to the Profile screen so sync problems are actually observable instead of a
 * silent background process nobody (including us, debugging remotely) can see into. */
export interface CloudSyncStatus {
  /** False outside an actual Telegram client — there's no initData to sync with there. */
  enabled: boolean;
  /** True once the very first pull attempt has *settled* (succeeded or failed) — or
   * immediately, outside an actual Telegram client, where there's no initData to sync with and
   * so no cycle to wait for either. App.tsx gates rendering the main UI (Header, BottomNav,
   * every screen) behind this, so no component can fire an authenticated API call (Stars,
   * matchmaking, Syndicates, ...) before this account's cloud state has at least been checked
   * once — that race is what let a completely new account's very first launch hit those
   * endpoints before anything was ready, while a reload (landing after this had already
   * settled once) worked fine. Deliberately keyed off *settling*, not off success specifically:
   * gating on success alone would leave the app stuck on the loading screen forever if the very
   * first pull hit a transient network error, which is a worse failure mode than the race this
   * fixes. */
  isInitialized: boolean;
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
  isInitialized: false,
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

/** Discriminates a plain success from the backend refusing a stale write (see sync.mts's POST
 * handler): a 409 means the cloud already holds a save stamped newer than what we just tried
 * to send, and carries that save's current state in the body so the caller can adopt it
 * immediately instead of quietly losing the write and waiting for the next scheduled pull. */
type PushOutcome =
  | { ok: true }
  | { ok: false; conflictState: PlayerState | null };

async function pushState(initData: string, state: PlayerState): Promise<PushOutcome> {
  const res = await fetch(SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData, state }),
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { state?: unknown } | null;
    const conflict = body?.state;
    const conflictState =
      conflict &&
      typeof conflict === 'object' &&
      typeof (conflict as PlayerState).lastSaved === 'number'
        ? (conflict as PlayerState)
        : null;
    return { ok: false, conflictState };
  }
  if (!res.ok) throw new Error(`POST /api/sync -> ${res.status}`);
  return { ok: true };
}

/** Best-effort push that survives the page being backgrounded/closed right as it fires. A
 * plain fetch() started inside a visibilitychange/pagehide handler can get cut off before it
 * completes once the browser suspends the page — this was silently losing every save-on-
 * close push on iOS (which backgrounds tabs almost immediately) while happening to still
 * work on desktop, where suspension is much less aggressive. sendBeacon is what browsers
 * provide specifically to keep running past that point; the tradeoff is no custom headers,
 * which is why initData now travels in the JSON body instead of a header. There's no
 * delivery confirmation for a beacon (the browser only reports whether it was *queued*), so
 * this path doesn't feed the visible status the way pullRemote/pushState do, and a 409
 * conflict on this path can't be detected or adopted — an accepted limitation of sendBeacon. */
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
 * indicator in the Profile screen) and a manual `syncNow` trigger.
 *
 * Hard invariant, load-bearing for correctness: `pushIfChanged` refuses to send *anything*
 * until the very first pull has settled against the backend (see `hasPulledInitialStateRef`
 * below). This is what a real data-wipe incident traced back to — a serverless cold start on
 * the pull request took longer than PUSH_INTERVAL_MS, so the periodic push fired first and
 * happily sent this device's untouched, all-default local state (freshly reset because
 * Telegram had wiped the WebView's storage overnight) up to the backend, permanently
 * overwriting the player's real save before the pull ever got a chance to bring it down. */
export function useCloudSync(): { status: CloudSyncStatus; syncNow: () => void } {
  const [status, setStatus] = useState<CloudSyncStatus>(initialStatus);
  const lastPushedAtRef = useRef(0);
  const pullRemoteRef = useRef<() => void>(() => {});
  const pushIfChangedRef = useRef<(reliable: boolean) => void>(() => {});
  /** Closed (false) until the initial pull settles with a real answer from the backend —
   * success (data or a genuinely-new-player empty save) — and only ever set back to false
   * never. A network error does NOT open it: that's not a resolution, it's silence, and the
   * PULL_INTERVAL_MS retry loop keeps trying until one actually lands. `pushIfChanged` is the
   * single choke point that checks this, so every push path (periodic interval, reactive
   * push-on-change, visibilitychange/pagehide/beforeunload, and manual `syncNow`) is covered
   * by one guard instead of needing to remember to check it everywhere separately. */
  const hasPulledInitialStateRef = useRef(false);
  /** Set for the duration of a `set()` call that applies a remote snapshot into the store (an
   * adopted pull, or a conflict-state adopted off a rejected push), so the reactive
   * subscription below — which exists to push *local* actions the instant they happen — does
   * not mistake "we just received this from the backend" for "the player just did something"
   * and immediately push it right back up. */
  const isApplyingRemoteUpdateRef = useRef(false);

  useEffect(() => {
    if (!isRunningInTelegram()) {
      setStatus((s) => ({ ...s, isInitialized: true }));
      return;
    }
    setStatus((s) => ({ ...s, enabled: true }));
    const initData = WebApp.initData;
    let cancelled = false;

    const applyRemoteState = (remote: PlayerState) => {
      isApplyingRemoteUpdateRef.current = true;
      useGameStore.getState().hydrateFromRemote(remote);
      isApplyingRemoteUpdateRef.current = false;
    };

    const pullRemote = () => {
      Promise.all([
        fetchRemoteState(initData), 
        fetchMySyndicate(),
        (async () => {
          if (supabase) {
            const userId = getTelegramUserId();
            if (userId) {
              const { data, error } = await supabase.from('profiles').select('syndicate_id').eq('id', userId).maybeSingle();
              if (error) {
                console.warn('Error fetching Supabase profile:', error);
              }
              if (!data && !error) {
                await supabase.from('profiles').upsert({ id: userId, syndicate_id: null }, { onConflict: 'id' }).catch((e) => {
                  console.warn('Profile creation failed:', e);
                });
              }
              return data?.syndicate_id || null;
            }
          }
          return null;
        })()
      ])
        .then(([remote, syndicate, supabaseSyndicateId]) => {
          if (cancelled) return;
          const isInitialPull = !hasPulledInitialStateRef.current;
          
          const remoteSyndicateId = supabaseSyndicateId || (syndicate ? syndicate.id : null) || (remote ? remote.syndicateId : null);
          if (useGameStore.getState().syndicateId !== remoteSyndicateId) {
            useGameStore.getState().setSyndicateId(remoteSyndicateId);
          }

          setStatus((s) => ({
            ...s,
            isInitialized: true,
            lastPullAt: Date.now(),
            lastPullOk: true,
            lastError: null,
            remoteScrapAtLastPull: remote ? remote.scrap : s.remoteScrapAtLastPull,
          }));
          if (remote) {
            remote.syndicateId = remoteSyndicateId;
            const localBaseline = Math.max(localLastSavedAtLoad, lastPushedAtRef.current);
            const shouldAdopt =
              (isInitialPull && !getHadLocalSaveAtLoad()) || remote.lastSaved > localBaseline;
            
            if (shouldAdopt) {
              applyRemoteState(remote);
            }
          } else if (isInitialPull) {
            // No save on file at all, on this session's very first pull — a genuinely new
            // account. This is the one moment a `?startapp=ref_X` launch can be safely linked:
            // registerReferralIfNewPlayer re-derives the inviter id straight off this launch's
            // own (already backend-verified) initData, and the backend's own one-shot CAS lock
            // is what actually makes this idempotent — not this `isInitialPull` gate, which is
            // just what keeps a returning player's every later periodic pull from bothering to
            // call it at all.
            registerReferralIfNewPlayer().catch(() => {});
          }
          // The lock opens once the pull has genuinely settled against the backend — a real
          // answer (existing save, or `remote === null` for a brand-new player), not a
          // network failure. From here on, pushIfChanged is allowed to actually send.
          hasPulledInitialStateRef.current = true;
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setStatus((s) => ({
            ...s,
            isInitialized: true,
            lastPullAt: Date.now(),
            lastPullOk: false,
            lastError: err instanceof Error ? err.message : String(err),
          }));
          // Deliberately does not set hasPulledInitialStateRef — see its doc comment above.
        });
    };

    const pushIfChanged = (reliable: boolean) => {
      // HARD LOCK — see hasPulledInitialStateRef's doc comment. No payload leaves this
      // device before the initial pull has resolved, full stop.
      if (!hasPulledInitialStateRef.current) return;
      const state = getSyncableState(useGameStore.getState());
      if (state.lastSaved === lastPushedAtRef.current) return;
      lastPushedAtRef.current = state.lastSaved;
      if (reliable) {
        pushStateReliably(initData, state);
        return;
      }
      pushState(initData, state)
        .then((outcome) => {
          if (cancelled) return;
          if (outcome.ok) {
            setStatus((s) => ({ ...s, lastPushAt: Date.now(), lastPushOk: true, lastError: null }));
            return;
          }
          // 409: the backend already holds a save stamped newer than the one we just tried
          // to send — almost always another device having synced more recent progress in
          // the gap since this device's last pull. Adopt it immediately rather than
          // silently dropping the write and waiting for the next scheduled pull to notice.
          if (outcome.conflictState) applyRemoteState(outcome.conflictState);
          setStatus((s) => ({
            ...s,
            lastPushAt: Date.now(),
            lastPushOk: false,
            lastError: 'stale write rejected by backend (409) — adopted newer remote state',
          }));
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

    // Reacts to real actions (a purchase, a merge, a trade-in, a race result, ...) the
    // instant they happen, via the reliable (sendBeacon) push — rather than only ever
    // finding out up to PUSH_INTERVAL_MS later, by which point a suspended WebView may
    // never have gotten the chance to run that scheduled push at all.
    let previousSnapshot = useGameStore.getState();
    const unsubscribe = useGameStore.subscribe((state) => {
      const changed = SIGNIFICANT_KEYS.some((key) => state[key] !== previousSnapshot[key]);
      previousSnapshot = state;
      // Skip while a remote snapshot is being applied (pull adoption or 409-conflict
      // adoption) — that's data arriving *from* the backend, not a local action to send
      // back to it. pushIfChanged's own lastSaved-vs-lastPushedAtRef check would mostly
      // no-op this anyway once the timestamps line up, but skipping it here avoids a
      // redundant round-trip and keeps the intent explicit.
      if (changed && !isApplyingRemoteUpdateRef.current) pushIfChanged(true);
    });

    // All three of these exist because different browsers/WebViews fire different subsets
    // of them for "the user is leaving" — layering all three maximizes the chance at least
    // one fires before Telegram's WebView actually suspends this page's JS.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pushIfChanged(true);
      } else {
        pullRemote();
      }
    };
    const handlePageHide = () => pushIfChanged(true);
    const handleBeforeUnload = () => pushIfChanged(true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.clearInterval(pushIntervalId);
      window.clearInterval(pullIntervalId);
      unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const syncNow = () => {
    pullRemoteRef.current();
    // Force a push regardless of whether `lastSaved` looks unchanged, so "Sync Now" always
    // does something visible rather than silently no-op'ing on the `lastPushedAtRef` guard.
    // Still subject to the hasPulledInitialStateRef hard lock inside pushIfChanged — mashing
    // this before the very first pull has settled just re-triggers the pull, as it should.
    lastPushedAtRef.current = -1;
    pushIfChangedRef.current(false);
  };

  return { status, syncNow };
}
