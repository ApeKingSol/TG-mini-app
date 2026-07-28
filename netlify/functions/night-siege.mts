import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { extractInitData, verifyInitData, type VerifiedTelegramUser } from './_shared/verifyInitData';
import { ECONOMY, NIGHT_SIEGE, isBossAttackAvailable, getNightSiegeDamage } from '../../src/game/config/economy';
import { CAR_TIERS } from '../../src/game/config/carTiers';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_WRITE_RETRIES = 5;

/** One Corporate Convoy raid, shared across an entire Syndicate — keyed by syndicateId, so every
 * member reads/writes the exact same HP pool rather than each seeing their own copy.
 * `claimedBy` is the server's authoritative record of who has already collected
 * NIGHT_SIEGE.REWARD_NEON for this specific kill (see handleClaim). `damageLog` is a running
 * userId -> total-damage-dealt-to-this-boss map, purely for the Syndicate roster's per-member
 * display (see SyndicateHub.tsx) — it carries no reward logic of its own. `bossExpiresAt` is
 * when this boss auto-resets if it's still standing (see isBossExpired/NIGHT_SIEGE.BOSS_LIFETIME_MS). */
interface BossRecord {
  bossId: string;
  syndicateId: string;
  maxHp: number;
  currentHp: number;
  claimedBy: string[];
  damageLog: Record<string, number>;
  bossExpiresAt: number;
}

/** What the frontend (src/game/mock/siegeApi.ts) actually needs — `alreadyClaimed` is computed
 * per-requester from the full `claimedBy` list at read time, and `nextAttackAvailableAt` is
 * computed per-requester from the separate attack-cooldown store, so neither leaks anything
 * about other members beyond what `damageLog` itself already exposes (a shared raid stat, same
 * visibility as a leaderboard). */
interface PublicBossStatus {
  bossId: string;
  maxHp: number;
  currentHp: number;
  alreadyClaimed: boolean;
  bossExpiresAt: number;
  nextAttackAvailableAt: number | null;
  damageLog: Record<string, number>;
}

/** `record.claimedBy`/`damageLog` are read defensively here too (not just via
 * normalizeBossRecord at every call site) — cheap insurance against a future call site that
 * forgets to normalize first, so this function specifically can never throw on a legacy
 * record no matter what calls it. */
function toPublicStatus(
  record: BossRecord,
  requesterId: string,
  nextAttackAvailableAt: number | null,
): PublicBossStatus {
  return {
    bossId: record.bossId,
    maxHp: record.maxHp,
    currentHp: record.currentHp,
    alreadyClaimed: (record.claimedBy ?? []).includes(requesterId),
    bossExpiresAt: record.bossExpiresAt,
    nextAttackAvailableAt,
    damageLog: record.damageLog ?? {},
  };
}

function createFreshBoss(syndicateId: string, now: number): BossRecord {
  return {
    bossId: crypto.randomUUID(),
    syndicateId,
    maxHp: NIGHT_SIEGE.BOSS_MAX_HP,
    currentHp: NIGHT_SIEGE.BOSS_MAX_HP,
    claimedBy: [],
    damageLog: {},
    bossExpiresAt: now + NIGHT_SIEGE.BOSS_LIFETIME_MS,
  };
}

/** Backfills fields that didn't exist in older schema versions of this record (a boss created
 * before damageLog/bossExpiresAt were added to the shape) with safe defaults, so a record
 * written by an earlier deploy can never crash a handler or send a client a value (like
 * `undefined` where a number is expected) that renders as "NaN:NaN:NaN". A missing
 * `bossExpiresAt` gets a fresh full lifetime *from now* rather than being treated as already
 * expired — treating it as expired would silently wipe an in-progress raid's HP/damage for
 * free the instant this deploy shipped, which is worse than just giving it a fair countdown.
 * Called immediately after every read from the `night-siege` store, before the record is used
 * anywhere. */
function normalizeBossRecord(record: BossRecord, now: number): BossRecord {
  return {
    ...record,
    claimedBy: record.claimedBy ?? [],
    damageLog: record.damageLog ?? {},
    bossExpiresAt: Number.isFinite(record.bossExpiresAt)
      ? record.bossExpiresAt
      : now + NIGHT_SIEGE.BOSS_LIFETIME_MS,
  };
}

/** True only for a boss that's still alive past its own lifetime — a *defeated* boss
 * (currentHp <= 0) never expires on its own; it just sits claimable until a member explicitly
 * starts the next raid (see handleSpawnNext). Only an undefeated boss auto-resets, per the
 * "72 hours pass and HP > 0" rule. */
function isBossExpired(record: BossRecord, now: number): boolean {
  return record.currentHp > 0 && now > record.bossExpiresAt;
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

interface AttackCooldownRecord {
  lastAttackAt: number;
}

/** The requester's own next-eligible-attack timestamp, or null if they've never attacked —
 * derived from the same `night-siege-attack-cooldown` store handleSubmitDamage's reservation
 * writes to, so GET/claim/spawn-next responses can show an accurate countdown without the
 * client having to have just attacked to know it. */
async function getNextAttackAvailableAt(
  userId: string,
  cooldowns: ReturnType<typeof getStore>,
): Promise<number | null> {
  const record = (await cooldowns.get(userId, { type: 'json' })) as AttackCooldownRecord | null;
  if (!record || !Number.isFinite(Number(record.lastAttackAt))) return null;
  return Number(record.lastAttackAt) + NIGHT_SIEGE.ATTACK_COOLDOWN_MS;
}

/** GET `?syndicateId=X` — the Convoy's current shared HP for that Syndicate, lazily spawning a
 * fresh full-HP boss the first time any member ever asks about it, or the moment an existing
 * one is found to have expired (still alive past its bossExpiresAt) — this is a best-effort,
 * non-CAS reset purely for the read path; the write-path handlers below (submit-damage, claim,
 * spawn-next) each re-check expiry against their own freshly-read etag before mutating. */
async function handleGet(
  req: Request,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
): Promise<Response> {
  const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  const syndicateId = new URL(req.url).searchParams.get('syndicateId') ?? '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  const now = Date.now();
  const raw = (await bosses.get(syndicateId, { type: 'json' })) as BossRecord | null;
  let record = raw ? normalizeBossRecord(raw, now) : null;
  if (!record || isBossExpired(record, now)) {
    const fresh = createFreshBoss(syndicateId, now);
    await bosses.setJSON(syndicateId, fresh);
    record = fresh;
  }

  const nextAttackAvailableAt = await getNextAttackAvailableAt(user.id, cooldowns);
  return jsonResponse(toPublicStatus(record, user.id, nextAttackAvailableAt));
}

interface SubmitDamageBody {
  action: 'submit-damage';
  initData?: unknown;
  syndicateId?: unknown;
  carTier?: unknown;
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

/** Adds one player's single deterministic strike to the shared HP pool, gated by an 8h
 * per-player cooldown enforced via a CAS'd reservation in the `night-siege-attack-cooldown`
 * store (reserved *before* the boss is touched, so two near-simultaneous calls from the same
 * account can't both land a hit) — damage itself is `getNightSiegeDamage(carTier)`, entirely
 * server-computed from the submitted carTier rather than trusted as a raw client-supplied
 * damage number, though carTier itself is not cross-checked against the account's real save
 * (consistent with this project's established client-trusted-economy model — see
 * PART_BUY_COST_MULTIPLIER-adjacent trust notes throughout GameStore.ts). */
async function handleSubmitDamage(
  user: VerifiedTelegramUser,
  body: SubmitDamageBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  const rawCarTier = typeof body.carTier === 'number' ? body.carTier : NaN;
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!Number.isFinite(rawCarTier) || rawCarTier < 1) {
    return jsonResponse({ error: 'carTier must be a positive number.' }, 400);
  }
  if (!(await verifyMembership(user, syndicateId, membership))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  const carTier = Math.min(Math.floor(rawCarTier), CAR_TIERS.length);
  const now = Date.now();

  const cooldownExisting = await cooldowns.getWithMetadata(user.id, { type: 'json' });
  const lastAttackAt = cooldownExisting
    ? (cooldownExisting.data as AttackCooldownRecord).lastAttackAt
    : null;
  if (!isBossAttackAvailable(lastAttackAt, now)) {
    return jsonResponse(
      {
        error: 'Attack cooldown has not elapsed yet.',
        nextAttackAvailableAt: lastAttackAt! + NIGHT_SIEGE.ATTACK_COOLDOWN_MS,
      },
      429,
    );
  }

  // Reserve the attack slot before touching the boss at all — CAS'd against whatever cooldown
  // record currently exists, so a double-tap or two open tabs can't both pass the check above
  // and both land a hit.
  const reserved: { modified: boolean } = cooldownExisting
    ? await cooldowns.setJSON(user.id, { lastAttackAt: now }, { onlyIfMatch: cooldownExisting.etag })
    : await cooldowns.setJSON(user.id, { lastAttackAt: now }, { onlyIfNew: true });
  if (!reserved.modified) {
    return jsonResponse({ error: 'Could not register this attack — please try again.' }, 409);
  }

  const damage = getNightSiegeDamage(carTier);

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });
    const normalized = existing ? normalizeBossRecord(existing.data as BossRecord, now) : null;
    const record: BossRecord =
      normalized && !isBossExpired(normalized, now) ? normalized : createFreshBoss(syndicateId, now);

    const updated: BossRecord = {
      ...record,
      currentHp: Math.max(0, record.currentHp - damage),
      damageLog: { ...record.damageLog, [user.id]: (record.damageLog[user.id] ?? 0) + damage },
    };

    const result = existing
      ? await bosses.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag })
      : await bosses.setJSON(syndicateId, updated, { onlyIfNew: true });
    if (result.modified) {
      return jsonResponse(toPublicStatus(updated, user.id, now + NIGHT_SIEGE.ATTACK_COOLDOWN_MS));
    }
    // Conflicting concurrent write (another member's own attack/claim/spawn-next landed first)
    // — retry against the freshest record. The attack reservation above already happened, so
    // this retry loop only concerns the boss record itself, not the cooldown gate.
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
 * player can't both succeed). A boss found to have expired (see isBossExpired) is reset here
 * too — that's the "3-day time limit" rule applying even if the first caller to notice is
 * trying to *claim* rather than attack or poll GET. */
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

    const now = Date.now();
    const record = normalizeBossRecord(existing.data as BossRecord, now);

    if (isBossExpired(record, now)) {
      const fresh = createFreshBoss(syndicateId, now);
      const result = await bosses.setJSON(syndicateId, fresh, { onlyIfMatch: existing.etag });
      if (result.modified) {
        return jsonResponse(
          { error: 'The Convoy escaped before the final blow — a new raid has begun.' },
          400,
        );
      }
      continue; // etag mismatch — retry against the freshest record.
    }
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

/** Starts a fresh raid (new bossId, full HP, empty claimedBy/damageLog) once the current one is
 * defeated (or found to have expired while still alive) — any member can trigger it,
 * deliberately not automatic on the next GET after a kill, so a member who hasn't yet had the
 * chance to see "Boss Defeated" and claim their reward can't have that window closed out from
 * under them by someone else's page reload. */
async function handleSpawnNext(
  user: VerifiedTelegramUser,
  body: SpawnNextBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });
    const now = Date.now();

    if (!existing) {
      const fresh = createFreshBoss(syndicateId, now);
      const result = await bosses.setJSON(syndicateId, fresh, { onlyIfNew: true });
      if (result.modified) {
        const nextAttackAvailableAt = await getNextAttackAvailableAt(user.id, cooldowns);
        return jsonResponse(toPublicStatus(fresh, user.id, nextAttackAvailableAt));
      }
      continue; // someone else created it first — retry against whatever they wrote
    }

    const record = normalizeBossRecord(existing.data as BossRecord, now);
    if (record.currentHp > 0 && !isBossExpired(record, now)) {
      // Still alive and not expired — someone else already reset/spawned, or it was never
      // actually defeated; report the current one instead of erroring, so a stale tap from a
      // client that hasn't re-polled yet still lands on something sane.
      const nextAttackAvailableAt = await getNextAttackAvailableAt(user.id, cooldowns);
      return jsonResponse(toPublicStatus(record, user.id, nextAttackAvailableAt));
    }

    const fresh = createFreshBoss(syndicateId, now);
    const result = await bosses.setJSON(syndicateId, fresh, { onlyIfMatch: existing.etag });
    if (result.modified) {
      const nextAttackAvailableAt = await getNextAttackAvailableAt(user.id, cooldowns);
      return jsonResponse(toPublicStatus(fresh, user.id, nextAttackAvailableAt));
    }
    // etag mismatch — retry against the freshest record.
  }

  return jsonResponse({ error: 'Could not start the next raid — please try again.' }, 409);
}

async function handlePost(
  req: Request,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
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
      return handleSubmitDamage(user, payload as SubmitDamageBody, bosses, membership, cooldowns);
    case 'claim':
      return handleClaim(user, payload as ClaimBody, bosses, membership);
    case 'spawn-next':
      return handleSpawnNext(user, payload as SpawnNextBody, bosses, membership, cooldowns);
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
  const cooldowns = getStore({ name: 'night-siege-attack-cooldown', consistency: 'strong' });

  if (req.method === 'GET') return handleGet(req, bosses, membership, cooldowns);
  if (req.method === 'POST') return handlePost(req, bosses, membership, cooldowns);
  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/night-siege',
};
