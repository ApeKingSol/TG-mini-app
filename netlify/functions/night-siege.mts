import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { extractInitData, verifyInitData, type VerifiedTelegramUser } from './_shared/verifyInitData';
import { ECONOMY, NIGHT_SIEGE } from '../../src/game/config/economy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_WRITE_RETRIES = 5;

/** One Corporate Convoy raid, shared across an entire Syndicate — keyed by syndicateId, so every
 * member reads/writes the exact same HP pool rather than each seeing their own copy. `claimedBy`
 * is the server's authoritative record of who has already collected NIGHT_SIEGE.REWARD_NEON for
 * this specific kill; it's what actually prevents a double-claim (see handleClaim below), not
 * anything the client remembers locally. */
interface BossRecord {
  bossId: string;
  syndicateId: string;
  maxHp: number;
  currentHp: number;
  claimedBy: string[];
}

/** What the frontend (src/game/mock/siegeApi.ts) actually needs — `alreadyClaimed` is computed
 * per-requester from the full `claimedBy` list at read time, so this never leaks the rest of the
 * Syndicate's claim status to someone who doesn't need it. */
interface PublicBossStatus {
  bossId: string;
  maxHp: number;
  currentHp: number;
  alreadyClaimed: boolean;
}

function toPublicStatus(record: BossRecord, requesterId: string): PublicBossStatus {
  return {
    bossId: record.bossId,
    maxHp: record.maxHp,
    currentHp: record.currentHp,
    alreadyClaimed: record.claimedBy.includes(requesterId),
  };
}

function createFreshBoss(syndicateId: string): BossRecord {
  return {
    bossId: crypto.randomUUID(),
    syndicateId,
    maxHp: NIGHT_SIEGE.BOSS_MAX_HP,
    currentHp: NIGHT_SIEGE.BOSS_MAX_HP,
    claimedBy: [],
  };
}

/** Every response goes through here specifically so no-cache headers can never be forgotten on
 * a new branch — see syndicates.mts's identical helper for the full reasoning (a cached "Convoy
 * still at X HP" GET response would be indistinguishable from real Blobs eventual-consistency
 * lag, which 'strong' consistency below already guards against separately). */
const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  pragma: 'no-cache',
  expires: '0',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_CACHE_HEADERS });
}

/** True only if `user` is a *current* member of `syndicateId`, per the same
 * `syndicate-membership` store syndicates.mts itself writes to (a plain userId -> syndicateId
 * text pointer) — reused here rather than duplicated, since Blobs stores are named globally, not
 * scoped per source file. Required on every action below: without it, a modified client could
 * peek at (or submit fake damage/claims against) a Syndicate it was never actually added to. */
async function verifyMembership(
  user: VerifiedTelegramUser,
  syndicateId: string,
  membership: ReturnType<typeof getStore>,
): Promise<boolean> {
  const mySyndicateId = await membership.get(user.id, { type: 'text' });
  return mySyndicateId === syndicateId;
}

/** GET `?syndicateId=X` — the Convoy's current shared HP for that Syndicate, lazily spawning a
 * fresh full-HP boss the first time any member ever asks about it. */
async function handleGet(
  req: Request,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  const syndicateId = new URL(req.url).searchParams.get('syndicateId') ?? '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  const existing = (await bosses.get(syndicateId, { type: 'json' })) as BossRecord | null;
  if (existing) return jsonResponse(toPublicStatus(existing, user.id));

  const fresh = createFreshBoss(syndicateId);
  await bosses.setJSON(syndicateId, fresh);
  return jsonResponse(toPublicStatus(fresh, user.id));
}

interface SubmitDamageBody {
  action: 'submit-damage';
  initData?: unknown;
  syndicateId?: unknown;
  damage?: unknown;
}
interface ClaimBody {
  action: 'claim';
  initData?: unknown;
  syndicateId?: unknown;
}
interface SpawnNextBody {
  action: 'spawn-next';
  initData?: unknown;
  syndicateId?: unknown;
}
type PostBody = SubmitDamageBody | ClaimBody | SpawnNextBody;

/** Adds one player's end-of-combat-window damage to the shared HP pool, clamped at
 * NIGHT_SIEGE.MAX_PLAUSIBLE_SESSION_DAMAGE so a tampered client can't blow past what one real
 * 30-second tap window could ever legitimately produce and solo-kill the boss in a single call. */
async function handleSubmitDamage(
  user: VerifiedTelegramUser,
  body: SubmitDamageBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  const damage = typeof body.damage === 'number' ? body.damage : NaN;
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!Number.isFinite(damage) || damage <= 0) {
    return jsonResponse({ error: 'damage must be a positive number.' }, 400);
  }
  if (!(await verifyMembership(user, syndicateId, membership))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  const clampedDamage = Math.min(damage, NIGHT_SIEGE.MAX_PLAUSIBLE_SESSION_DAMAGE);

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });
    const record: BossRecord = existing ? (existing.data as BossRecord) : createFreshBoss(syndicateId);
    const updated: BossRecord = { ...record, currentHp: Math.max(0, record.currentHp - clampedDamage) };

    const result = existing
      ? await bosses.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag })
      : await bosses.setJSON(syndicateId, updated, { onlyIfNew: true });
    if (result.modified) return jsonResponse(toPublicStatus(updated, user.id));
    // Conflicting concurrent write (another member's own submit-damage/claim/spawn-next landed
    // first) — retry against the freshest record.
  }

  return jsonResponse({ error: 'Could not submit damage — please try again.' }, 409);
}

/** Best-effort: mirrors the reward directly into this account's cross-device save (Blobs
 * `game-saves`, the same store useCloudSync.ts's backend reads/writes), so a *different* device
 * belonging to the same player picks it up on its own next pull. The device that actually calls
 * claim also credits itself locally right away (see NightSiege.tsx's handleClaim) — that's what
 * makes this write merely a redundant, eventually-consistent mirror rather than this account's
 * only source of the reward; if it doesn't land (no save on file yet, or a lost CAS race against
 * this player's own in-flight sync push), the next natural pull/push cycle reconciles it, same
 * reasoning as telegram-webhook.mts's handleSuccessfulPayment. */
async function creditNeonReward(userId: string, bossId: string): Promise<void> {
  const saves = getStore({ name: 'game-saves', consistency: 'strong' });
  const existing = await saves.getWithMetadata(userId, { type: 'json' });
  if (!existing) return; // no save on file — nothing safe to merge a reward into

  const record = existing.data as {
    neon?: number;
    neonHistory?: unknown[];
    lastClaimedBossId?: string | null;
    [key: string]: unknown;
  };
  const now = Date.now();
  const updated = {
    ...record,
    neon: (record.neon ?? 0) + NIGHT_SIEGE.REWARD_NEON,
    neonHistory: [
      {
        id: crypto.randomUUID(),
        label: 'Night Siege — Boss Kill Reward',
        amount: NIGHT_SIEGE.REWARD_NEON,
        timestamp: now,
      },
      ...(Array.isArray(record.neonHistory) ? record.neonHistory : []),
    ].slice(0, ECONOMY.NEON_HISTORY_MAX_ENTRIES),
    lastClaimedBossId: bossId,
    lastSaved: now,
  };
  await saves.setJSON(userId, updated, { onlyIfMatch: existing.etag });
}

/** Claims the flat NIGHT_SIEGE.REWARD_NEON payout for the Convoy's current kill — only once the
 * shared HP has actually reached 0, and only once per member per boss (enforced by CAS-adding
 * `user.id` into that boss's own `claimedBy`, so two near-simultaneous claim calls from the same
 * player can't both succeed). */
async function handleClaim(
  user: VerifiedTelegramUser,
  body: ClaimBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  let claimedBossId: string | null = null;
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });
    if (!existing) return jsonResponse({ error: 'No Convoy raid found for this Syndicate.' }, 404);

    const record = existing.data as BossRecord;
    if (record.currentHp > 0) {
      return jsonResponse({ error: 'The Convoy is still standing.' }, 400);
    }
    if (record.claimedBy.includes(user.id)) {
      return jsonResponse({ error: 'You already claimed this kill.' }, 409);
    }

    const updated: BossRecord = { ...record, claimedBy: [...record.claimedBy, user.id] };
    const result = await bosses.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) {
      claimedBossId = record.bossId;
      break;
    }
    // etag mismatch — retry against the freshest record.
  }

  if (claimedBossId === null) {
    return jsonResponse({ error: 'Could not claim — please try again.' }, 409);
  }

  await creditNeonReward(user.id, claimedBossId);
  return jsonResponse({ claimed: true, bossId: claimedBossId, rewardNeon: NIGHT_SIEGE.REWARD_NEON });
}

/** Starts a fresh raid (new bossId, full HP, empty claimedBy) once the current one is defeated —
 * any member can trigger it, deliberately not automatic on the next GET after a kill, so a member
 * who hasn't yet had the chance to see "Boss Defeated" and claim their reward can't have that
 * window closed out from under them by someone else's page reload. */
async function handleSpawnNext(
  user: VerifiedTelegramUser,
  body: SpawnNextBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });

    if (!existing) {
      const fresh = createFreshBoss(syndicateId);
      const result = await bosses.setJSON(syndicateId, fresh, { onlyIfNew: true });
      if (result.modified) return jsonResponse(toPublicStatus(fresh, user.id));
      continue; // someone else created it first — retry against whatever they wrote
    }

    const record = existing.data as BossRecord;
    if (record.currentHp > 0) {
      // Someone else already started a fresh raid (or this one was never actually defeated) —
      // report the current one instead of erroring, so a stale tap from a client that hasn't
      // re-polled yet still lands on something sane.
      return jsonResponse(toPublicStatus(record, user.id));
    }

    const fresh = createFreshBoss(syndicateId);
    const result = await bosses.setJSON(syndicateId, fresh, { onlyIfMatch: existing.etag });
    if (result.modified) return jsonResponse(toPublicStatus(fresh, user.id));
    // etag mismatch — retry against the freshest record.
  }

  return jsonResponse({ error: 'Could not start the next raid — please try again.' }, 409);
}

async function handlePost(
  req: Request,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400);
  }

  const payload = body as Partial<PostBody> | null;
  const user = verifyInitData(extractInitData(req, payload), BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  switch (payload?.action) {
    case 'submit-damage':
      return handleSubmitDamage(user, payload as SubmitDamageBody, bosses, membership);
    case 'claim':
      return handleClaim(user, payload as ClaimBody, bosses, membership);
    case 'spawn-next':
      return handleSpawnNext(user, payload as SpawnNextBody, bosses, membership);
    default:
      return jsonResponse({ error: 'action must be one of: submit-damage, claim, spawn-next' }, 400);
  }
}

export default async (req: Request, _context: Context) => {
  // 'strong' consistency, same reasoning as syndicates.mts: a raid's shared HP is read-then-
  // acted-on with nothing to retry it against if a stale read from a different edge/region
  // showed the wrong number — unlike sync.mts's save data, which tolerates a few seconds of
  // eventual-consistency lag since it's re-polled every 2s anyway.
  const bosses = getStore({ name: 'night-siege', consistency: 'strong' });
  const membership = getStore({ name: 'syndicate-membership', consistency: 'strong' });

  if (req.method === 'GET') return handleGet(req, bosses, membership);
  if (req.method === 'POST') return handlePost(req, bosses, membership);
  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/night-siege',
};
