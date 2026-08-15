import type { Context } from '@netlify/functions';
import { getStore } from '../../server/mock-blobs';
import { extractInitData, verifyInitData, type VerifiedTelegramUser } from './_shared/verifyInitData';
import { REFERRAL } from '../../src/game/config/economy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_WRITE_RETRIES = 5;

/** Every response goes through here so no-cache headers can never be forgotten on a new branch
 * — same reasoning as sync.mts/night-siege.mts/syndicates.mts's identical helpers. */
const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  pragma: 'no-cache',
  expires: '0',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_CACHE_HEADERS });
}

/** Just the fields this file reads or writes off a player's save record in the shared
 * `game-saves` Blobs store (see sync.mts — the same store useCloudSync.ts's backend reads and
 * writes). Every other field a real record holds (inventory, upgrades, neonHistory, ...) is
 * untyped here on purpose and preserved by always spreading `...record` before applying a delta
 * (see creditUnclaimedRewards/handleClaimRewards below) — this file must never reconstruct or
 * overwrite a save from scratch. */
interface SaveRecordFields {
  carTier?: number;
  neon?: number;
  scrap?: number;
  unclaimedNeon?: number;
  unclaimedScrap?: number;
  validReferralsCount?: number;
  totalReferralsCount?: number;
  lastSaved?: number;
  [key: string]: unknown;
}

/** One invitee -> inviter edge, stored in the dedicated `referral-links` Blobs store keyed by
 * the *invitee's* userId. Permanent once written (see handleRegister's `onlyIfNew`) — nothing in
 * this file ever updates or deletes an existing link. */
interface ReferralLink {
  inviterId: string;
  linkedAt: number;
}

/** Extracts the `ref_<telegramId>` id half out of the *already-verified* initData string's own
 * `start_param` field (present whenever the Mini App was launched via a `?startapp=ref_X` deep
 * link) — deliberately never read from a client-supplied field in the request body. By the time
 * this runs, `rawInitData`'s HMAC signature has already been checked by verifyInitData, so
 * re-reading another one of its own query params is exactly as trustworthy as the `user` field
 * verifyInitData itself extracts from the same string. A `referrerId` field in the JSON body,
 * by contrast, could be set to literally anything by a modified client with zero way to prove
 * it — accepting one there would let any account falsely claim to have been invited by (and
 * inflate the validReferralsCount of) any other account it chooses. */
function parseReferrerIdFromInitData(rawInitData: string): string | null {
  // Telegram passes startapp param exactly as it is, BUT if the link used was ?start=... 
  // (which is the standard way a bot starts, and how we generated our link to launch the bot), 
  // Telegram injects it into initData as start_param.
  const startParam = new URLSearchParams(rawInitData).get('start_param') ?? '';
  const match = /^ref_(\d+)$/.exec(startParam);
  return match ? match[1] : null;
}

/** Safely applies a delta to `userId`'s own unclaimedNeon/unclaimedScrap (and, only for the
 * inviter side of a milestone credit, increments validReferralsCount) via the same
 * read-etag-modify-CAS-write retry loop as night-siege.mts's handleSubmitDamage/
 * creditNeonReward against this identical `game-saves` store. Every field already on the record
 * that isn't explicitly touched here is preserved by spreading `...record` first, so this can
 * never clobber another device's concurrent save of the same account — or, when crediting an
 * *inviter* (a different account entirely from the caller), any of that other player's own
 * data. Bumps `lastSaved` on every successful write: without that, a device that already pulled
 * a save once would never recognize this update as newer on its next scheduled poll (see
 * useCloudSync.ts's last-write-wins comparison) and would silently never adopt the credit at
 * all. Returns false if there's no save on file for `userId` (nothing safe to credit into) or if
 * every retry lost the CAS race. */
async function creditUnclaimedRewards(
  saves: ReturnType<typeof getStore>,
  userId: string,
  neonDelta: number,
  scrapDelta: number,
  incrementValidReferrals: boolean,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await saves.getWithMetadata(userId, { type: 'json' });
    if (!existing) return false;

    const record = existing.data as SaveRecordFields;
    const updated: SaveRecordFields = {
      ...record,
      unclaimedNeon: (typeof record.unclaimedNeon === 'number' ? record.unclaimedNeon : 0) + neonDelta,
      unclaimedScrap: (typeof record.unclaimedScrap === 'number' ? record.unclaimedScrap : 0) + scrapDelta,
      ...(incrementValidReferrals && {
        validReferralsCount:
          (typeof record.validReferralsCount === 'number' ? record.validReferralsCount : 0) + 1,
      }),
      lastSaved: Date.now(),
    };

    const result = await saves.setJSON(userId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return true;
    // Conflicting concurrent write (this same account syncing from another device, or another
    // milestone/claim landing on this exact record at the same instant) — retry against
    // whatever the freshest record now holds.
  }
  return false;
}

/** Bumps `userId`'s own totalReferralsCount by 1 — called exactly once, the moment a brand-new
 * invitee's link to them is first established (see handleRegister), independent of whether that
 * invitee ever goes on to reach Tier 5 (that separate, milestone-gated tally is
 * validReferralsCount, bumped instead by creditUnclaimedRewards from handleMilestoneReached).
 * Same CAS read-etag-modify-write retry loop as creditUnclaimedRewards, just for a single
 * counter rather than an economy credit — every other field on the record is preserved by
 * spreading `...record` first, same "never overwrite the rest of a save" guarantee. */
async function incrementTotalReferralsCount(
  saves: ReturnType<typeof getStore>,
  userId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await saves.getWithMetadata(userId, { type: 'json' });
    if (!existing) return false;

    const record = existing.data as SaveRecordFields;
    const updated: SaveRecordFields = {
      ...record,
      totalReferralsCount:
        (typeof record.totalReferralsCount === 'number' ? record.totalReferralsCount : 0) + 1,
      lastSaved: Date.now(),
    };

    const result = await saves.setJSON(userId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return true;
    // Conflicting concurrent write — retry against the freshest record.
  }
  return false;
}

/** GET — this account's own Vault numbers plus its referral code (its own Telegram id;
 * ReferralsScreen.tsx builds its shareable link from the same id it already has locally, this
 * just confirms it). Purely a read: never creates a link, credits anything, or claims anything.
 * Missing fields on an older save (or one with no referral activity at all yet) default to 0
 * rather than crashing or rendering as `undefined`. */
async function handleGet(req: Request, saves: ReturnType<typeof getStore>): Promise<Response> {
  const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  const raw = (await saves.get(user.id, { type: 'json' })) as SaveRecordFields | null;
  return jsonResponse({
    unclaimedNeon: typeof raw?.unclaimedNeon === 'number' ? raw.unclaimedNeon : 0,
    unclaimedScrap: typeof raw?.unclaimedScrap === 'number' ? raw.unclaimedScrap : 0,
    validReferralsCount: typeof raw?.validReferralsCount === 'number' ? raw.validReferralsCount : 0,
    totalReferralsCount:
      typeof raw?.totalReferralsCount === 'number' ? raw.totalReferralsCount : 0,
    referralCode: user.id,
  });
}

interface RegisterBody {
  action: 'register';
  initData?: unknown;
}
interface MilestoneReachedBody {
  action: 'milestone-reached';
  initData?: unknown;
  carTier?: unknown;
}
interface ClaimRewardsBody {
  action: 'claim-rewards';
  initData?: unknown;
}
type PostBody = RegisterBody | MilestoneReachedBody | ClaimRewardsBody;

/** Links this (new) account to whoever's `ref_<id>` link they launched through, permanently and
 * only ever once: `onlyIfNew` means the very first successful write for this invitee's userId
 * wins, and every later attempt against that same key — a relaunch of the same link, a retried
 * request, a completely different link — is a silent no-op, so nobody's recorded inviter can
 * ever change after the fact. Also refuses a self-referral outright, and requires the claimed
 * inviter to actually be a real, previously-registered account (checked against the shared
 * `game-saves` store) before linking — otherwise a typo'd or made-up id could sit in
 * `referral-links` forever as a dead link nothing could ever credit.
 *
 * The moment a link is *genuinely new* (not found already sitting there from an earlier call)
 * is also when the inviter's raw totalReferralsCount goes up — independent of whether this
 * invitee ever reaches Tier 5 later (see validReferralsCount/handleMilestoneReached for that
 * separate, milestone-gated tally). This is what lets the REF tab show a "Pending" count of
 * invitees who joined but haven't hit the milestone yet. */
async function handleRegister(
  user: VerifiedTelegramUser,
  rawInitData: string,
  saves: ReturnType<typeof getStore>,
  referralLinks: ReturnType<typeof getStore>,
): Promise<Response> {
  const referrerId = parseReferrerIdFromInitData(rawInitData);
  if (!referrerId || referrerId === user.id) {
    return jsonResponse({ ok: true, linked: false });
  }

  const referrerSave = await saves.get(referrerId, { type: 'json' });
  if (!referrerSave) {
    return jsonResponse({ ok: true, linked: false });
  }

  const link: ReferralLink = { inviterId: referrerId, linkedAt: Date.now() };
  const result = await referralLinks.setJSON(user.id, link, { onlyIfNew: true });
  if (result.modified) {
    await incrementTotalReferralsCount(saves, referrerId);
  }
  return jsonResponse({ ok: true, linked: result.modified });
}

/** Credits the Tier-5 milestone bonus to *both* sides of a genuine referral — this account's
 * own unclaimedNeon/unclaimedScrap and, via the `referral-links` record handleRegister above
 * created, its inviter's matching pools plus one bump to their validReferralsCount. An account
 * that reaches this tier *without* ever having been linked to an inviter gets nothing from this
 * system at all: the reward is specifically for "an invited player reached Tier 5," not a
 * general Tier-5 completion bonus, so there is no invitee-side credit to hand out when there is
 * no inviter on the other end of it either.
 *
 * The one-shot idempotency lock (`referralMilestones`, `onlyIfNew`) is claimed only *after*
 * both the reported tier and the referral link have been confirmed — never before — so a
 * premature/buggy call, or a genuinely unreferred player's own Tier-5 crossing, can never
 * permanently burn this account's one shot at a reward it might actually qualify for once (or
 * if) a real link exists. The reported `carTier` is trusted from the caller the same way
 * claimNeonSyphon/claimQuest/creditBossKillReward already trust their own callers elsewhere in
 * this codebase (this project's established client-trusted-economy model), rather than
 * re-deriving it from this account's own separately-synced `game-saves` record: that record is
 * written by this same device's own useCloudSync push, which is not guaranteed to have landed
 * yet at the exact moment tradeInCar fires this call, and re-checking against it here would risk
 * rejecting a completely legitimate milestone purely due to that ordinary sync-lag race. */
async function handleMilestoneReached(
  user: VerifiedTelegramUser,
  body: MilestoneReachedBody,
  saves: ReturnType<typeof getStore>,
  referralLinks: ReturnType<typeof getStore>,
  referralMilestones: ReturnType<typeof getStore>,
): Promise<Response> {
  const carTier = typeof body.carTier === 'number' ? body.carTier : NaN;
  if (!Number.isFinite(carTier) || carTier < REFERRAL.MILESTONE_CAR_TIER) {
    return jsonResponse({ error: `carTier must be at least ${REFERRAL.MILESTONE_CAR_TIER}.` }, 400);
  }

  const link = (await referralLinks.get(user.id, { type: 'json' })) as ReferralLink | null;
  if (!link?.inviterId) {
    // Reached the tier organically, with no inviter on record — nothing to credit on either
    // side, and nothing to guard against re-processing either (there was never anything to
    // double-credit in the first place).
    return jsonResponse({ ok: true, credited: false, neonCredited: 0, scrapCredited: 0 });
  }

  const guard = await referralMilestones.setJSON(user.id, { reachedAt: Date.now() }, { onlyIfNew: true });
  if (!guard.modified) {
    return jsonResponse({ ok: true, credited: false, neonCredited: 0, scrapCredited: 0 });
  }

  const ownCredited = await creditUnclaimedRewards(
    saves,
    user.id,
    REFERRAL.MILESTONE_NEON_REWARD,
    REFERRAL.MILESTONE_SCRAP_REWARD,
    false,
  );
  await creditUnclaimedRewards(
    saves,
    link.inviterId,
    REFERRAL.MILESTONE_NEON_REWARD,
    REFERRAL.MILESTONE_SCRAP_REWARD,
    true,
  );

  return jsonResponse({
    ok: true,
    credited: ownCredited,
    neonCredited: ownCredited ? REFERRAL.MILESTONE_NEON_REWARD : 0,
    scrapCredited: ownCredited ? REFERRAL.MILESTONE_SCRAP_REWARD : 0,
  });
}

/** Moves 100% of this account's current unclaimedNeon/unclaimedScrap into its real balances,
 * atomically (same CAS retry loop as everywhere else in this file) and reports back exactly how
 * much was actually moved. That returned amount — never whatever the client had displayed
 * beforehand — is what ReferralsScreen.tsx credits locally via GameStore's
 * claimReferralRewards, so a milestone credit that lands in the gap between this account's last
 * poll and this exact claim can never be silently dropped or double-counted. */
async function handleClaimRewards(
  user: VerifiedTelegramUser,
  saves: ReturnType<typeof getStore>,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await saves.getWithMetadata(user.id, { type: 'json' });
    if (!existing) return jsonResponse({ error: 'No save found for this account.' }, 404);

    const record = existing.data as SaveRecordFields;
    const neonClaimed = typeof record.unclaimedNeon === 'number' ? record.unclaimedNeon : 0;
    const scrapClaimed = typeof record.unclaimedScrap === 'number' ? record.unclaimedScrap : 0;
    if (neonClaimed <= 0 && scrapClaimed <= 0) {
      return jsonResponse({ neonClaimed: 0, scrapClaimed: 0 });
    }

    const updated: SaveRecordFields = {
      ...record,
      neon: (typeof record.neon === 'number' ? record.neon : 0) + neonClaimed,
      scrap: (typeof record.scrap === 'number' ? record.scrap : 0) + scrapClaimed,
      unclaimedNeon: 0,
      unclaimedScrap: 0,
      lastSaved: Date.now(),
    };

    const result = await saves.setJSON(user.id, updated, { onlyIfMatch: existing.etag });
    if (result.modified) {
      return jsonResponse({ neonClaimed, scrapClaimed });
    }
    // Conflicting concurrent write (e.g. this account's own device pushing a routine sync at
    // the same instant) — retry against the freshest record.
  }

  return jsonResponse({ error: 'Could not claim rewards — please try again.' }, 409);
}

async function handlePost(
  req: Request,
  saves: ReturnType<typeof getStore>,
  referralLinks: ReturnType<typeof getStore>,
  referralMilestones: ReturnType<typeof getStore>,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400);
  }

  const payload = body as Partial<PostBody> | null;
  const rawInitData = extractInitData(req, payload as { initData?: unknown } | null);
  const user = verifyInitData(rawInitData, BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  switch (payload?.action) {
    case 'register':
      return handleRegister(user, rawInitData, saves, referralLinks);
    case 'milestone-reached':
      return handleMilestoneReached(user, payload as MilestoneReachedBody, saves, referralLinks, referralMilestones);
    case 'claim-rewards':
      return handleClaimRewards(user, saves);
    default:
      return jsonResponse(
        { error: 'action must be one of: register, milestone-reached, claim-rewards' },
        400,
      );
  }
}

export default async (req: Request) => {
  try {
  // 'strong' consistency throughout: every write in this file is a CAS read-modify-write (etag
  // or onlyIfNew) that depends on seeing the *current* value to correctly detect a conflict —
  // same reasoning night-siege.mts documents for its own use of 'strong' against this identical
  // `game-saves` store.
  const saves = getStore({ name: 'game-saves', consistency: 'strong' });
  const referralLinks = getStore({ name: 'referral-links', consistency: 'strong' });
  const referralMilestones = getStore({ name: 'referral-milestones', consistency: 'strong' });

  if (req.method === 'GET') return handleGet(req, saves);
  if (req.method === 'POST') return handlePost(req, saves, referralLinks, referralMilestones);
  return new Response('Method Not Allowed', { status: 405 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e), stack: e.stack }), { status: 500 });
  }
};

export const config = {
  path: '/api/referrals',
};
