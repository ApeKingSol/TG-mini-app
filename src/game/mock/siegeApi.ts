import { WebApp, isRunningInTelegram } from '../../lib/telegram';

/**
 * Night Siege API surface — backed by netlify/functions/night-siege.mts (Netlify Blobs, keyed
 * by Syndicate id, membership verified against the same `syndicate-membership` store
 * syndicates.mts writes to), the same real cross-device backend pattern as syndicateApi.ts and
 * useCloudSync.ts. A raid only exists once a Leader/Co-Leader explicitly starts one (see
 * startRaid below) — "no active raid" is a real, first-class state, not just a loading state.
 * The Corporate Convoy's HP is genuinely shared across every member's device — one player's
 * submitted tapping-session damage is visible to the rest of the Syndicate on their next poll,
 * the per-player 8h attack cooldown and the boss's own 72h expiry are both enforced
 * server-side, and a kill's tiered reward can only ever be claimed once per member.
 */

export interface ConvoyStatus {
  bossId: string;
  maxHp: number;
  currentHp: number;
  /** Whether *this* account has already claimed its tiered $NEON reward (see
   * getNightSiegeReward in economy.ts) for this specific bossId — computed server-side from the
   * boss record's own `claimedBy` list, the actual source of truth (see NightSiege.tsx's use of
   * PlayerState.lastClaimedBossId for the fast local mirror this backs up). */
  alreadyClaimed: boolean;
  /** Unix ms timestamp this Convoy auto-expires at if it's still alive — see
   * NIGHT_SIEGE.BOSS_LIFETIME_MS in economy.ts. */
  bossExpiresAt: number;
  /** userId -> total damage dealt to this specific boss — a shared raid stat (same visibility
   * as a leaderboard), rendered next to each member's name in SyndicateHub.tsx's roster. */
  damageLog: Record<string, number>;
}

/** The envelope every GET and every POST action responds with — `boss: null` means "no active
 * raid right now" (a real, meaningful answer, not an error). `nextAttackAvailableAt` is reported
 * independently of whether a boss even exists, so a member can see their own cooldown status
 * ahead of a Leader/Co-Leader starting the next raid. */
export interface NightSiegeStatus {
  boss: ConvoyStatus | null;
  /** Unix ms timestamp *this* account can next attack, or null if it's never attacked — the
   * server's own authoritative view of the same cooldown PlayerState.lastBossAttackTime mirrors
   * locally. */
  nextAttackAvailableAt: number | null;
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
 * consistent whether the failure was a validation error, a 401/403/404/409/429, or a malformed
 * response — same helper as syndicateApi.ts. */
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

/** Fetches the Syndicate's current raid status — `boss: null` if no Leader/Co-Leader has
 * started one yet (or the last one expired/was cleared), plus the requester's own attack
 * cooldown regardless. `_t` busts any GET cache a WebView/proxy might apply on its own
 * initiative, same reasoning as syndicateApi.ts's fetchSyndicates. */
export function fetchNightSiegeStatus(syndicateId: string): Promise<NightSiegeStatus> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(
    `${NIGHT_SIEGE_ENDPOINT}?syndicateId=${encodeURIComponent(syndicateId)}&_t=${Date.now()}`,
    { headers: authHeaders(), cache: 'no-store' },
  ).then((response) => parseJsonOrThrow<NightSiegeStatus>(response));
}

/** Starts a fresh raid (new bossId, full HP) — only succeeds for the Syndicate's Leader or a
 * Co-Leader (see night-siege.mts's handleStartRaid); works both for the very first raid and for
 * starting the next one after a kill or an expiry. Rejects if a raid is already actively
 * underway. */
export function startRaid(syndicateId: string): Promise<NightSiegeStatus> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(NIGHT_SIEGE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'start-raid', syndicateId }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<NightSiegeStatus>(response));
}

/** Submits the *total* damage accumulated across one 15-second tapping session
 * (NIGHT_SIEGE.TAP_PHASE_SECONDS) in a single batched request, rather than one request per tap.
 * The server clamps this to a plausible ceiling for the given carTier (see
 * getMaxNightSiegeSessionDamage in economy.ts) rather than trusting it unbounded, and enforces
 * the 8h per-player cooldown server-side — this rejects (429) if that cooldown hasn't elapsed,
 * regardless of what the local lastBossAttackTime mirror thinks, and rejects (404/400) if no
 * raid is currently active to hit. */
export function submitDamage(
  syndicateId: string,
  totalSessionDamage: number,
  carTier: number,
): Promise<NightSiegeStatus> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(NIGHT_SIEGE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      initData: WebApp.initData,
      action: 'submit-damage',
      syndicateId,
      totalSessionDamage,
      carTier,
    }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<NightSiegeStatus>(response));
}

/** Claims the flat tiered $NEON reward (see getNightSiegeReward in economy.ts) for the Convoy's
 * current kill. Only succeeds once (server-enforced, per bossId, per account — see
 * handleClaim in night-siege.mts) and only once the shared HP has actually reached 0; the
 * caller (NightSiege.tsx) is responsible for crediting the reward into local state via
 * GameStore's creditBossKillReward once this resolves. */
export function claimBossReward(syndicateId: string): Promise<ClaimResult> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(NIGHT_SIEGE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'claim', syndicateId }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<ClaimResult>(response));
}
