import type { Context } from '@netlify/functions';
import { getStore } from '../../server/mock-blobs';
import { extractInitData, verifyInitData, type VerifiedTelegramUser } from './_shared/verifyInitData';
import {
  ECONOMY,
  NIGHT_SIEGE,
  isBossAttackAvailable,
  getMaxNightSiegeSessionDamage,
  getNightSiegeReward,
  type SyndicateRole,
} from '../../src/game/config/economy';
import { CAR_TIERS } from '../../src/game/config/carTiers';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_WRITE_RETRIES = 5;

/** One Corporate Convoy raid, shared across an entire Syndicate — keyed by syndicateId, so every
 * member reads/writes the exact same HP pool rather than each seeing their own copy. There is
 * no lazily-created default boss any more: a record only exists once a Leader/Co-Leader
 * explicitly starts one (see handleStartRaid) — "no record" is a real, first-class state
 * ("no active raid"), not just a transient loading state. `claimedBy` is the server's
 * authoritative record of who has already collected their tiered reward (see
 * handleClaim/getNightSiegeReward). `damageLog` is a running userId -> total-damage map, purely
 * for the Syndicate roster's per-member display (see SyndicateHub.tsx). `bossExpiresAt` is when
 * this boss auto-expires if it's still standing (see isBossExpired/NIGHT_SIEGE.BOSS_LIFETIME_MS)
 * — an expired boss doesn't respawn itself either; a Leader/Co-Leader has to start the next one. */
interface BossRecord {
  bossId: string;
  syndicateId: string;
  maxHp: number;
  currentHp: number;
  claimedBy: string[];
  damageLog: Record<string, number>;
  bossExpiresAt: number;
}

/** What the frontend (src/game/mock/siegeApi.ts) actually needs for a boss that exists —
 * `alreadyClaimed` is computed per-requester from the full `claimedBy` list at read time, so it
 * can never leak anyone else's claim status. */
interface PublicBossStatus {
  bossId: string;
  maxHp: number;
  currentHp: number;
  alreadyClaimed: boolean;
  bossExpiresAt: number;
  damageLog: Record<string, number>;
}

/** The envelope every GET and every POST action responds with — `boss: null` is a real,
 * meaningful answer ("no active raid right now"), not an error, and `nextAttackAvailableAt` is
 * reported independently of whether a boss even exists, so a member can see their own cooldown
 * status ahead of a Leader/Co-Leader starting the next raid. */
interface NightSiegeStatusResponse {
  boss: PublicBossStatus | null;
  nextAttackAvailableAt: number | null;
}

/** Every field is read defensively here too (not just via normalizeBossRecord at every call
 * site) — cheap insurance against a future call site that forgets to normalize first, so this
 * function specifically can never throw on a legacy record no matter what calls it. */
function toPublicStatus(record: BossRecord, requesterId: string): PublicBossStatus {
  return {
    bossId: record.bossId,
    maxHp: record.maxHp,
    currentHp: record.currentHp,
    alreadyClaimed: (record.claimedBy ?? []).includes(requesterId),
    bossExpiresAt: record.bossExpiresAt,
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

/** Rejects anything that isn't structurally a real BossRecord — a corrupted/partial value ever
 * ending up in the store (a failed write, a manual edit, some future bug) should be treated
 * exactly like "no record exists yet" and safely replaced via the same CAS-guarded path, rather
 * than being blindly cast and used. */
function isValidBossRecord(value: unknown): value is BossRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<BossRecord>;
  return (
    typeof record.bossId === 'string' &&
    Number.isFinite(record.currentHp) &&
    Number.isFinite(record.maxHp)
  );
}

/** Backfills fields that didn't exist in older schema versions of this record with safe
 * defaults, so a record written by an earlier deploy can never crash a handler or send a client
 * a value that renders as "NaN:NaN:NaN". A missing `bossExpiresAt` gets a fresh full lifetime
 * *from now* rather than being treated as already expired — treating it as expired would
 * silently wipe an in-progress raid's HP/damage for free the instant this deploy shipped. Only
 * ever call this on a value that already passed isValidBossRecord. */
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
 * (currentHp <= 0) never expires on its own; it just sits claimable until a Leader/Co-Leader
 * explicitly starts the next raid (see handleStartRaid). Only an undefeated boss auto-expires,
 * per the "72 hours pass and HP > 0" rule. */
function isBossExpired(record: BossRecord, now: number): boolean {
  return record.currentHp > 0 && now > record.bossExpiresAt;
}

/** Reads a boss record straight off a raw Blobs value (already known-existing) — validates and
 * normalizes it in one step, so every call site gets either a trustworthy BossRecord or `null`
 * (treated identically to "no record"), rather than each site repeating the same
 * isValidBossRecord + normalizeBossRecord pairing. */
function readBossRecord(raw: unknown, now: number): BossRecord | null {
  if (!isValidBossRecord(raw)) return null;
  return normalizeBossRecord(raw, now);
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
  syndicates?: ReturnType<typeof getStore>,
): Promise<boolean> {
  const mySyndicateId = await membership.get(String(user.id), { type: 'text' });
  if (String(mySyndicateId) === String(syndicateId)) return true;

  if (syndicates) {
    const record = (await syndicates.get(syndicateId, { type: 'json' })) as MinimalSyndicateRecord | null;
    if (record && (record.memberIds ?? []).map(String).includes(String(user.id))) {
      return true;
    }
  }

  return false;
}

/** Just the fields this file needs off a Syndicate record (see syndicates.mts's own
 * StoredSyndicate for the full persisted shape) — reads straight from the shared `syndicates`
 * Blobs store to resolve a caller's role for the start-raid gate and the reward tier.
 * `coLeaderIds` is optional here for the same reason syndicates.mts normalizes it: a Syndicate
 * created before Co-Leader roles existed won't have this key in Blobs at all. */
interface MinimalSyndicateRecord {
  leaderId: string | number;
  coLeaderIds?: (string | number)[];
  memberIds?: (string | number)[];
}

/** Resolves `userId`'s standing within `syndicateId` — Leader, Co-Leader, or a regular member.
 * Falls back to 'member' if the Syndicate record can't be found (shouldn't happen, since every
 * caller of this has already passed verifyMembership, but a fail-safe default here should never
 * be "grant elevated permissions"). */
async function getSyndicateRole(
  userId: string,
  syndicateId: string,
  syndicates: ReturnType<typeof getStore>,
): Promise<SyndicateRole> {
  const record = (await syndicates.get(syndicateId, { type: 'json' })) as MinimalSyndicateRecord | null;
  if (!record) return 'member';
  if (String(record.leaderId) === String(userId)) return 'leader';
  if ((record.coLeaderIds ?? []).map(String).includes(String(userId))) return 'co-leader';
  return 'member';
}

interface AttackCooldownRecord {
  lastAttackAt: number;
}

/** The requester's own next-eligible-attack timestamp, or null if they've never attacked —
 * derived from the same `night-siege-attack-cooldown` store handleSubmitDamage's reservation
 * writes to, so GET/submit-damage responses can show an accurate countdown without the client
 * having to have just attacked to know it. */
async function getNextAttackAvailableAt(
  userId: string,
  cooldowns: ReturnType<typeof getStore>,
): Promise<number | null> {
  const record = (await cooldowns.get(userId, { type: 'json' })) as AttackCooldownRecord | null;
  if (!record || !Number.isFinite(Number(record.lastAttackAt))) return null;
  return Number(record.lastAttackAt) + NIGHT_SIEGE.ATTACK_COOLDOWN_MS;
}

/** GET `?syndicateId=X` — the current raid (or `null` if none is active) plus the requester's
 * own cooldown status. Purely a read: this never creates, resets, or otherwise mutates
 * anything — a boss that's expired-while-alive is simply reported as `boss: null` here (its
 * record isn't deleted; the CAS-guarded write paths, start-raid and submit-damage, are the only
 * things that ever actually overwrite it). */
async function handleGet(
  req: Request,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
  syndicates: ReturnType<typeof getStore>,
): Promise<Response> {
  const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  const syndicateId = new URL(req.url).searchParams.get('syndicateId') ?? '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership, syndicates))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  const now = Date.now();
  const raw = await bosses.get(syndicateId, { type: 'json' });
  const record = readBossRecord(raw, now);
  const boss = record && !isBossExpired(record, now) ? toPublicStatus(record, user.id) : null;
  const nextAttackAvailableAt = await getNextAttackAvailableAt(user.id, cooldowns);
  const response: NightSiegeStatusResponse = { boss, nextAttackAvailableAt };
  return jsonResponse(response);
}

interface StartRaidBody {
  action: 'start-raid';
  initData?: unknown;
  syndicateId?: unknown;
}
interface SubmitDamageBody {
  action: 'submit-damage';
  initData?: unknown;
  syndicateId?: unknown;
  totalSessionDamage?: unknown;
  carTier?: unknown;
}
interface ClaimBody {
  action: 'claim';
  initData?: unknown;
  syndicateId?: unknown;
}
type PostBody = StartRaidBody | SubmitDamageBody | ClaimBody;

/** Spawns a fresh Convoy (new bossId, full HP, empty claimedBy/damageLog) — only the Leader or
 * a Co-Leader can call this successfully. Works both for the very first raid a Syndicate ever
 * runs and for starting the next one after a kill or an expiry: if a record already exists but
 * is defeated or expired, it's safely overwritten (CAS'd against its own etag); if one exists
 * and is genuinely still alive and active, this is rejected rather than silently replacing an
 * in-progress raid out from under whoever's currently attacking it. */
async function handleStartRaid(
  user: VerifiedTelegramUser,
  body: StartRaidBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  syndicates: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership, syndicates))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  const role = await getSyndicateRole(user.id, syndicateId, syndicates);
  if (role === 'member') {
    return jsonResponse({ error: 'Only the Leader or a Co-Leader can start a raid.' }, 403);
  }

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });
    const now = Date.now();

    if (existing) {
      const record = readBossRecord(existing.data, now);
      if (record && record.currentHp > 0 && !isBossExpired(record, now)) {
        return jsonResponse({ error: 'A raid is already in progress.' }, 409);
      }
      const fresh = createFreshBoss(syndicateId, now);
      const result = await bosses.setJSON(syndicateId, fresh, { onlyIfMatch: existing.etag });
      if (result.modified) {
        const nextAttackAvailableAt = await getNextAttackAvailableAt(user.id, cooldowns);
        const response: NightSiegeStatusResponse = {
          boss: toPublicStatus(fresh, user.id),
          nextAttackAvailableAt,
        };
        return jsonResponse(response);
      }
      continue; // etag mismatch — retry against the freshest record.
    }

    const fresh = createFreshBoss(syndicateId, now);
    const result = await bosses.setJSON(syndicateId, fresh, { onlyIfNew: true });
    if (result.modified) {
      const nextAttackAvailableAt = await getNextAttackAvailableAt(user.id, cooldowns);
      const response: NightSiegeStatusResponse = {
        boss: toPublicStatus(fresh, user.id),
        nextAttackAvailableAt,
      };
      return jsonResponse(response);
    }
    // someone else created it first — retry against whatever they wrote
  }

  return jsonResponse({ error: 'Could not start the raid — please try again.' }, 409);
}

/** Submits the *total* damage accumulated across one member's 15-second tapping session
 * (see NIGHT_SIEGE.TAP_PHASE_SECONDS) in a single batched request, gated by an 8h per-player
 * cooldown enforced via a CAS'd reservation in the `night-siege-attack-cooldown` store — the
 * cooldown is only actually reserved once a genuinely active raid is confirmed to exist, so a
 * rejected attempt (no raid running) doesn't cost the player their next window. `totalSessionDamage`
 * is trusted from the client (this project's established client-trusted-economy model — see
 * PART_BUY_COST_MULTIPLIER-adjacent trust notes throughout GameStore.ts) but clamped to
 * getMaxNightSiegeSessionDamage(carTier), a generous ceiling for how much even very fast
 * tapping could plausibly land in one session, so a tampered client can't claim an unbounded
 * total. */
async function handleSubmitDamage(
  user: VerifiedTelegramUser,
  body: SubmitDamageBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
  syndicates: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  const rawDamage = typeof body.totalSessionDamage === 'number' ? body.totalSessionDamage : NaN;
  const rawCarTier = typeof body.carTier === 'number' ? body.carTier : NaN;
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!Number.isFinite(rawDamage) || rawDamage <= 0) {
    return jsonResponse({ error: 'totalSessionDamage must be a positive number.' }, 400);
  }
  if (!Number.isFinite(rawCarTier) || rawCarTier < 1) {
    return jsonResponse({ error: 'carTier must be a positive number.' }, 400);
  }
  if (!(await verifyMembership(user, syndicateId, membership, syndicates))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  const carTier = Math.min(Math.floor(rawCarTier), CAR_TIERS.length);
  const damage = Math.min(Math.floor(rawDamage), getMaxNightSiegeSessionDamage(carTier));
  const now = Date.now();

  // Confirm there's an active raid to hit *before* reserving the cooldown below — a rejected
  // attempt (no raid running, or one that already ended) shouldn't cost the player their next
  // window just because the tapping UI let them start a session against stale client state.
  const precheckRaw = await bosses.get(syndicateId, { type: 'json' });
  const precheckRecord = readBossRecord(precheckRaw, now);
  if (!precheckRecord || isBossExpired(precheckRecord, now)) {
    return jsonResponse({ error: 'No active raid — ask a Leader or Co-Leader to start one.' }, 404);
  }
  if (precheckRecord.currentHp <= 0) {
    return jsonResponse(
      { error: 'The Convoy is already defeated — claim your reward or wait for the next raid.' },
      400,
    );
  }

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
  // record currently exists, so a double-submit or two open tabs can't both pass the check
  // above and both land damage.
  const reserved: { modified: boolean } = cooldownExisting
    ? await cooldowns.setJSON(user.id, { lastAttackAt: now }, { onlyIfMatch: cooldownExisting.etag })
    : await cooldowns.setJSON(user.id, { lastAttackAt: now }, { onlyIfNew: true });
  if (!reserved.modified) {
    return jsonResponse({ error: 'Could not register this attack — please try again.' }, 409);
  }

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });
    const attemptNow = Date.now();
    if (!existing) {
      return jsonResponse({ error: 'No active raid — ask a Leader or Co-Leader to start one.' }, 404);
    }
    const record = readBossRecord(existing.data, attemptNow);
    if (!record || isBossExpired(record, attemptNow)) {
      return jsonResponse(
        { error: 'The raid has ended — ask a Leader or Co-Leader to start a new one.' },
        400,
      );
    }
    if (record.currentHp <= 0) {
      return jsonResponse(
        { error: 'The Convoy is already defeated — claim your reward or wait for the next raid.' },
        400,
      );
    }

    const updated: BossRecord = {
      ...record,
      currentHp: Math.max(0, record.currentHp - damage),
      damageLog: { ...record.damageLog, [user.id]: (record.damageLog[user.id] ?? 0) + damage },
    };

    const result = await bosses.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) {
      const response: NightSiegeStatusResponse = {
        boss: toPublicStatus(updated, user.id),
        nextAttackAvailableAt: attemptNow + NIGHT_SIEGE.ATTACK_COOLDOWN_MS,
      };
      return jsonResponse(response);
    }
    // Conflicting concurrent write (another member's own submission landed first) — retry
    // against the freshest record. The attack reservation above already happened, so this
    // retry loop only concerns the boss record itself, not the cooldown gate.
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
async function creditNeonReward(userId: string, bossId: string, amount: number): Promise<void> {
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
    neon: (record.neon ?? 0) + amount,
    neonHistory: [
      {
        id: crypto.randomUUID(),
        label: 'Night Siege — Boss Kill Reward',
        amount,
        timestamp: now,
      },
      ...(Array.isArray(record.neonHistory) ? record.neonHistory : []),
    ].slice(0, ECONOMY.NEON_HISTORY_MAX_ENTRIES),
    lastClaimedBossId: bossId,
    lastSaved: now,
  };
  await saves.setJSON(userId, updated, { onlyIfMatch: existing.etag });
}

/** Claims this account's tiered $NEON reward (see getNightSiegeReward) for the Convoy's current
 * kill — only once the shared HP has actually reached 0, and only once per member per boss
 * (enforced by CAS-adding `user.id` into that boss's own `claimedBy`, so two near-simultaneous
 * claim calls from the same player can't both succeed). */
async function handleClaim(
  user: VerifiedTelegramUser,
  body: ClaimBody,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  syndicates: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);
  if (!(await verifyMembership(user, syndicateId, membership, syndicates))) {
    return jsonResponse({ error: 'You are not a member of this Syndicate.' }, 403);
  }

  let claimedBossId: string | null = null;
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await bosses.getWithMetadata(syndicateId, { type: 'json' });
    if (!existing) return jsonResponse({ error: 'No Convoy raid found for this Syndicate.' }, 404);

    const now = Date.now();
    const record = readBossRecord(existing.data, now);
    if (!record) return jsonResponse({ error: 'No Convoy raid found for this Syndicate.' }, 404);

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

  const role = await getSyndicateRole(user.id, syndicateId, syndicates);
  const rewardNeon = getNightSiegeReward(role);
  await creditNeonReward(user.id, claimedBossId, rewardNeon);
  return jsonResponse({ claimed: true, bossId: claimedBossId, rewardNeon });
}

async function handlePost(
  req: Request,
  bosses: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
  cooldowns: ReturnType<typeof getStore>,
  syndicates: ReturnType<typeof getStore>,
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
    case 'start-raid':
      return handleStartRaid(user, payload as StartRaidBody, bosses, membership, syndicates, cooldowns);
    case 'submit-damage':
      return handleSubmitDamage(user, payload as SubmitDamageBody, bosses, membership, cooldowns, syndicates);
    case 'claim':
      return handleClaim(user, payload as ClaimBody, bosses, membership, syndicates);
    default:
      return jsonResponse({ error: 'action must be one of: start-raid, submit-damage, claim' }, 400);
  }
}

export default async (req: Request) => {
  // 'strong' consistency, same reasoning as syndicates.mts: a raid's shared HP is read-then-
  // acted-on with nothing to retry it against if a stale read from a different edge/region
  // showed the wrong number — unlike sync.mts's save data, which tolerates a few seconds of
  // eventual-consistency lag since it's re-polled every 2s anyway.
  const bosses = getStore({ name: 'night-siege', consistency: 'strong' });
  const membership = getStore({ name: 'syndicate-membership', consistency: 'strong' });
  const cooldowns = getStore({ name: 'night-siege-attack-cooldown', consistency: 'strong' });
  const syndicates = getStore({ name: 'syndicates', consistency: 'strong' });

  if (req.method === 'GET') return handleGet(req, bosses, membership, cooldowns, syndicates);
  if (req.method === 'POST') return handlePost(req, bosses, membership, cooldowns, syndicates);
  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/night-siege',
};
