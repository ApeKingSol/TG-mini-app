import { WebApp, isRunningInTelegram } from '../../lib/telegram';

/**
 * Night Siege API surface — backed by netlify/functions/night-siege.mts (Netlify Blobs, keyed
 * by Syndicate id, membership verified against the same `syndicate-membership` store
 * syndicates.mts writes to), the same real cross-device backend pattern as syndicateApi.ts and
 * useCloudSync.ts. The Corporate Convoy's HP is genuinely shared across every member's device —
 * one player's submitted damage is visible to the rest of the Syndicate on their next poll, and
 * the boss kill's reward can only ever be claimed once per member, enforced server-side.
 */

export interface ConvoyStatus {
  bossId: string;
  maxHp: number;
  currentHp: number;
  /** Whether *this* account has already claimed NIGHT_SIEGE.REWARD_NEON for this specific
   * bossId — computed server-side from the boss record's own `claimedBy` list, the actual
   * source of truth (see NightSiege.tsx's use of PlayerState.lastClaimedBossId for the fast
   * local mirror this backs up). */
  alreadyClaimed: boolean;
}

export interface ClaimResult {
  claimed: true;
  bossId: string;
  rewardNeon: number;
}

const NIGHT_SIEGE_ENDPOINT = '/api/night-siege';

interface ErrorBody {
  error?: string;
}

/** Every real endpoint call funnels through here so the "explain what went wrong" behavior is
 * consistent whether the failure was a validation error, a 401/403, or a malformed response —
 * same helper as syndicateApi.ts. */
async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.ok ? 'Malformed response from server.' : 'Request failed.');
  }
  if (!response.ok) {
    const message = (body as ErrorBody)?.error;
    throw new Error(message || 'Request failed.');
  }
  return body as T;
}

function authHeaders(): HeadersInit {
  return { 'x-telegram-init-data': WebApp.initData };
}

/** Outside an actual Telegram client there's no initData to authenticate with, and no Syndicate
 * membership to verify either — same convention as syndicateApi.ts's requireTelegram. */
function requireTelegram(): Promise<never> {
  return Promise.reject(new Error('Open this from Telegram to raid with your Syndicate.'));
}

/** Fetches the Convoy's current shared HP for a given Syndicate — lazily spawns a fresh
 * full-HP boss server-side the first time any member ever asks about it. `_t` busts any GET
 * cache a WebView/proxy might apply on its own initiative, same reasoning as
 * syndicateApi.ts's fetchSyndicates. */
export function fetchConvoyStatus(syndicateId: string): Promise<ConvoyStatus> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(
    `${NIGHT_SIEGE_ENDPOINT}?syndicateId=${encodeURIComponent(syndicateId)}&_t=${Date.now()}`,
    { headers: authHeaders(), cache: 'no-store' },
  ).then((response) => parseJsonOrThrow<ConvoyStatus>(response));
}

/** Submits this player's session damage at the end of their 30-second combat window, adding it
 * to the Syndicate-shared HP pool. The server clamps this to a plausible ceiling for one combat
 * window (NIGHT_SIEGE.MAX_PLAUSIBLE_SESSION_DAMAGE) rather than trusting it outright — see
 * night-siege.mts's handleSubmitDamage. Resolves to the Convoy's post-damage status. */
export function submitDamage(syndicateId: string, damageAmount: number): Promise<ConvoyStatus> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(NIGHT_SIEGE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      initData: WebApp.initData,
      action: 'submit-damage',
      syndicateId,
      damage: damageAmount,
    }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<ConvoyStatus>(response));
}

/** Claims the flat NIGHT_SIEGE.REWARD_NEON payout for the Convoy's current kill. Only succeeds
 * once (server-enforced, per bossId, per account — see handleClaim in night-siege.mts) and only
 * once the shared HP has actually reached 0; the caller (NightSiege.tsx) is responsible for
 * crediting the reward into local state via GameStore's creditBossKillReward once this
 * resolves. */
export function claimBossReward(syndicateId: string): Promise<ClaimResult> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(NIGHT_SIEGE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'claim', syndicateId }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<ClaimResult>(response));
}

/** Starts a fresh raid (new bossId, full HP) once the current Convoy is defeated — any member
 * can trigger it. Deliberately not automatic: see handleSpawnNext's doc comment in
 * night-siege.mts for why a kill has to stay claimable until a member explicitly moves on,
 * rather than the next GET silently rolling it over. */
export function spawnNextRaid(syndicateId: string): Promise<ConvoyStatus> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(NIGHT_SIEGE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'spawn-next', syndicateId }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<ConvoyStatus>(response));
}
