import { WebApp, isRunningInTelegram } from '../../lib/telegram';

/**
 * Referral System API surface — backed by netlify/functions/referrals.mts (Netlify Blobs), same
 * real cross-device backend pattern as syndicateApi.ts/siegeApi.ts. Rewards from an invitee
 * reaching Tier 5 accumulate in each side's own unclaimedNeon/unclaimedScrap (part of the normal
 * PlayerState — see game/types/index.ts — so they already ride along on useCloudSync's regular
 * pull/push cycle like every other balance field) until manually claimed via claimRewards below.
 */

const REFERRALS_ENDPOINT = '/api/referrals';

interface ErrorBody {
  error?: string;
}

/** Same "explain what went wrong" helper as syndicateApi.ts/siegeApi.ts, so a validation error,
 * a 401, or a malformed response all surface a real message instead of a generic failure. */
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

/** Outside an actual Telegram client there's no initData to authenticate with — same convention
 * as syndicateApi.ts's/siegeApi.ts's requireTelegram. */
function requireTelegram(): Promise<never> {
  return Promise.reject(new Error('Open this from Telegram to use the Referral System.'));
}

export interface MilestoneCreditResult {
  /** True only if this account was actually linked to an inviter (see
   * registerReferralIfNewPlayer below) — reaching the tier with no inviter on record credits
   * nothing on either side. */
  credited: boolean;
  neonCredited: number;
  scrapCredited: number;
}

/** Tells the backend this account just crossed REFERRAL.MILESTONE_CAR_TIER. The backend decides
 * whether this account was actually invited (only an invited player's own Tier-5 crossing pays
 * out, on both sides — see referrals.mts's handleMilestoneReached) and reports back exactly what
 * it credited; the caller (GameStore.ts's tradeInCar) applies exactly that reported amount to
 * local state via creditReferralMilestoneReward, never an optimistic guess made before knowing
 * whether this account was even referred at all. */
export function notifyReferralMilestone(carTier: number): Promise<MilestoneCreditResult> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(REFERRALS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'milestone-reached', carTier }),
    cache: 'no-store',
  }).then((response) =>
    parseJsonOrThrow<{ ok: true; credited: boolean; neonCredited: number; scrapCredited: number }>(
      response,
    ).then((body) => ({
      credited: body.credited,
      neonCredited: body.neonCredited,
      scrapCredited: body.scrapCredited,
    })),
  );
}

/** Asks the backend to link this account to whoever's `ref_<id>` start_param it launched
 * through, if any — safe to call on every fresh install/relaunch since the backend only ever
 * honors the very first successful link for a given account (see referrals.mts's handleRegister)
 * and silently no-ops every time after, regardless of how many times this is called or what
 * start_param (if any) a later relaunch happens to carry. useCloudSync.ts calls this exactly
 * once per session, right when a brand-new player's very first pull comes back with no save on
 * file — see its own doc comment for why that specific moment is the right (and only necessary)
 * one to call this from. */
export function registerReferralIfNewPlayer(): Promise<void> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(REFERRALS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'register' }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<{ ok: true; linked: boolean }>(response).then(() => undefined));
}

export interface ReferralsData {
  unclaimedNeon: number;
  unclaimedScrap: number;
  /** How many invitees have reached REFERRAL.MILESTONE_CAR_TIER. */
  validReferralsCount: number;
  /** How many invitees have *ever* registered with this account's link, milestone reached or
   * not — `totalReferralsCount - validReferralsCount` is the REF tab's "Pending" count. */
  totalReferralsCount: number;
  /** This account's own Telegram id — the same value ReferralsScreen.tsx's share link already
   * builds from getTelegramUserId() locally; returned here too purely so the REF tab's
   * displayed link and progress numbers can come from a single server round-trip together. */
  referralCode: string;
}

/** Force-refreshes the Vault numbers straight from the backend — used by ReferralsScreen.tsx on
 * mount so the tab doesn't have to wait for useCloudSync's next scheduled ~2s poll to reflect a
 * credit that just landed (this account's own milestone, or an inviter's tally bump). Purely a
 * read; never links, credits, or claims anything. */
export function fetchReferralsData(): Promise<ReferralsData> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(`${REFERRALS_ENDPOINT}?_t=${Date.now()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<ReferralsData>(response));
}

export interface ReferralClaimResult {
  neonClaimed: number;
  scrapClaimed: number;
}

/** Moves 100% of this account's current unclaimedNeon/unclaimedScrap into its real balances,
 * atomically, server-side, and reports back exactly how much was actually moved — which can
 * differ from whatever the client had displayed if another milestone credit landed in the gap
 * between this account's last poll and this exact claim. ReferralsScreen.tsx applies exactly
 * these returned amounts to the local store via GameStore's claimReferralRewards, never
 * whatever number happened to be on screen right before the request. */
export function submitReferralClaim(): Promise<ReferralClaimResult> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(REFERRALS_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'claim-rewards' }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<ReferralClaimResult>(response));
}
