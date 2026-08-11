import type { Context } from '@netlify/functions';
import { getStore } from '../../server/mock-blobs';
import { extractInitData, verifyInitData, type VerifiedTelegramUser } from './_shared/verifyInitData';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_MAX_MEMBERS = 50;
const MAX_WRITE_RETRIES = 5;

/** One roster entry as the frontend renders it (src/game/mock/syndicateApi.ts) — `isLeader`/
 * `isCoLeader` are derived here, at read time, from `leaderId`/`coLeaderIds` rather than stored
 * per-member, so they can never drift out of sync with the source of truth. */
interface SyndicateMember {
  id: string;
  name: string;
  isLeader: boolean;
  isCoLeader: boolean;
}

/** The public shape the frontend already knows how to render (src/game/mock/syndicateApi.ts) —
 * `membersCount` is always derived from `memberIds.length` at read time, never stored
 * separately, so the two can never drift out of sync. */
interface Syndicate {
  id: string;
  name: string;
  tag: string;
  membersCount: number;
  maxMembers: number;
  leaderId: string;
  coLeaderIds: string[];
  members: SyndicateMember[];
}

/** The full record as actually stored — `memberIds`/`coLeaderIds` are the source of truth
 * `membersCount`/`members[].isCoLeader` are derived from; it never leaves this file.
 * `memberNames` is a simple id -> display name mirror, populated from each member's own
 * verified initData the moment they create/join, purely so the roster UI has something
 * readable to show — Blobs has no join across stores, so this is cheaper than fetching each
 * member's own save just to read a name. */
interface StoredSyndicate {
  id: string;
  name: string;
  tag: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  maxMembers: number;
  leaderId: string;
  coLeaderIds: string[];
}

/** Backfills fields that didn't exist in older schema versions of this record (a Syndicate
 * created before Co-Leader roles/named rosters were added, back when StoredSyndicate was just
 * `{id, name, tag, memberIds, maxMembers, leaderId}`) with safe defaults, so a record written
 * by an earlier deploy can never crash a handler that calls `.includes()`/property-access on a
 * field that simply doesn't exist on it yet. Called immediately after every read from the
 * `syndicates` store, before the record is used anywhere. */
function normalizeSyndicateRecord(record: StoredSyndicate): StoredSyndicate {
  return {
    ...record,
    coLeaderIds: record.coLeaderIds ?? [],
    memberNames: record.memberNames ?? {},
  };
}

/** `record.coLeaderIds`/`memberNames` are read defensively here too (not just via
 * normalizeSyndicateRecord at every call site) — cheap insurance against a future call site
 * that forgets to normalize first, so this function specifically can never throw on a legacy
 * record no matter what calls it. */
function toPublicSyndicate(record: StoredSyndicate): Syndicate {
  const coLeaderIds = record.coLeaderIds ?? [];
  const memberNames = record.memberNames ?? {};
  return {
    id: record.id,
    name: record.name,
    tag: record.tag,
    membersCount: record.memberIds.length,
    maxMembers: record.maxMembers,
    leaderId: record.leaderId,
    coLeaderIds,
    members: record.memberIds.map((id) => ({
      id,
      name: memberNames[id] ?? `Runner #${id.slice(-4)}`,
      isLeader: id === record.leaderId,
      isCoLeader: coLeaderIds.includes(id),
    })),
  };
}

/** Every response goes through here specifically so no-cache headers can never be forgotten on
 * a new branch — a WebView/CDN that caches a "no Syndicates yet" GET response would look
 * identical to the real Netlify Blobs eventual-consistency lag this file also fixes below (see
 * the getStore() calls in the default export), so both are worth closing at once. */
const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  pragma: 'no-cache',
  expires: '0',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: NO_CACHE_HEADERS,
  });
}

function membershipKey(userId: string): string {
  return userId;
}

/** GET — no query params: every Syndicate that exists (the server browser). `?mine=1`: just the
 * caller's own Syndicate, or `{ syndicate: null }` if they aren't in one. Both require a valid
 * initData header, since "am I in a Syndicate" is itself per-account state, not public. */
async function handleGet(req: Request, syndicates: ReturnType<typeof getStore>, membership: ReturnType<typeof getStore>): Promise<Response> {
  const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  const url = new URL(req.url);
  if (url.searchParams.get('mine') === '1') {
    const syndicateId = await membership.get(membershipKey(user.id), { type: 'text' });
    if (!syndicateId) return jsonResponse({ syndicate: null });

    const record = (await syndicates.get(syndicateId, { type: 'json' })) as StoredSyndicate | null;
    if (!record || !record.memberIds.includes(user.id)) {
      // The membership pointer outlived the Syndicate it pointed to (deleted outright, or —
      // now that kicking exists — this account was removed from it by someone else) —
      // self-heal rather than leave the caller permanently stuck believing they're in a
      // Syndicate they're no longer actually part of.
      await membership.delete(membershipKey(user.id));
      return jsonResponse({ syndicate: null });
    }
    return jsonResponse({ syndicate: toPublicSyndicate(record) });
  }

  const { blobs } = await syndicates.list();
  const records = await Promise.all(
    blobs.map((blob) => syndicates.get(blob.key, { type: 'json' }) as Promise<StoredSyndicate | null>),
  );
  const list = records.filter((record): record is StoredSyndicate => record !== null).map(toPublicSyndicate);
  return jsonResponse({ syndicates: list });
}

interface CreateBody {
  action: 'create';
  initData?: unknown;
  name?: unknown;
  tag?: unknown;
}
interface JoinBody {
  action: 'join';
  initData?: unknown;
  syndicateId?: unknown;
}
interface LeaveBody {
  action: 'leave';
  initData?: unknown;
}
interface PromoteBody {
  action: 'promote';
  initData?: unknown;
  targetUserId?: unknown;
}
interface DemoteBody {
  action: 'demote';
  initData?: unknown;
  targetUserId?: unknown;
}
interface KickBody {
  action: 'kick';
  initData?: unknown;
  targetUserId?: unknown;
}
type PostBody = CreateBody | JoinBody | LeaveBody | PromoteBody | DemoteBody | KickBody;

async function handleCreate(
  user: VerifiedTelegramUser,
  body: CreateBody,
  syndicates: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const tag = typeof body.tag === 'string' ? body.tag.trim().toUpperCase() : '';
  if (!name || !tag) return jsonResponse({ error: 'Name and tag are required.' }, 400);

  // Reserve the membership slot atomically first (onlyIfNew fails if this user already has a
  // pointer) — this is the operation that has to be exclusive, not the Syndicate record itself,
  // since a brand-new random id can never collide with an existing one.
  const record: StoredSyndicate = {
    id: crypto.randomUUID(),
    name,
    tag,
    memberIds: [user.id],
    memberNames: { [user.id]: user.firstName },
    maxMembers: DEFAULT_MAX_MEMBERS,
    leaderId: user.id,
    coLeaderIds: [],
  };

  const reserved = await membership.set(membershipKey(user.id), record.id, { onlyIfNew: true });
  if (!reserved.modified) {
    return jsonResponse({ error: 'You are already in a Syndicate.' }, 409);
  }

  await syndicates.setJSON(record.id, record);
  return jsonResponse(toPublicSyndicate(record));
}

async function handleJoin(
  user: VerifiedTelegramUser,
  body: JoinBody,
  syndicates: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = typeof body.syndicateId === 'string' ? body.syndicateId : '';
  if (!syndicateId) return jsonResponse({ error: 'syndicateId is required.' }, 400);

  const reserved = await membership.set(membershipKey(user.id), syndicateId, { onlyIfNew: true });
  if (!reserved.modified) {
    return jsonResponse({ error: 'You are already in a Syndicate.' }, 409);
  }

  // The membership slot is reserved — now actually add the member to the Syndicate record,
  // retrying on concurrent-write conflicts (another join/leave landing between our read and
  // write) via the entry's etag. If this Syndicate turns out not to exist, is full, or every
  // retry loses the race, roll the reservation back so the caller isn't left believing they're
  // in a Syndicate they were never actually added to.
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await syndicates.getWithMetadata(syndicateId, { type: 'json' });
    if (!existing) {
      await membership.delete(membershipKey(user.id));
      return jsonResponse({ error: 'This Syndicate no longer exists.' }, 404);
    }

    const record = existing.data as StoredSyndicate;
    if (record.memberIds.includes(user.id)) {
      // Already a member server-side somehow (e.g. a retried request) — treat as success.
      return jsonResponse(toPublicSyndicate(record));
    }
    if (record.memberIds.length >= record.maxMembers) {
      await membership.delete(membershipKey(user.id));
      return jsonResponse({ error: 'This Syndicate is full.' }, 409);
    }

    const updated: StoredSyndicate = {
      ...record,
      memberIds: [...record.memberIds, user.id],
      memberNames: { ...record.memberNames, [user.id]: user.firstName },
    };
    const result = await syndicates.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return jsonResponse(toPublicSyndicate(updated));
    // etag mismatch — someone else wrote to this Syndicate between our read and write; retry.
  }

  await membership.delete(membershipKey(user.id));
  return jsonResponse({ error: 'Could not join — please try again.' }, 409);
}

/** Removes `targetId` from a Syndicate's memberIds/coLeaderIds/memberNames, retrying on
 * concurrent-write conflicts via etag — shared by handleLeave (removing yourself) and
 * handleKick (removing someone else) so both paths apply the exact same auto-delete-when-
 * empty rule. Returns the updated record on success, the literal string `'deleted'` if removing
 * this member emptied the Syndicate and its record was deleted outright (so no ghost Syndicate
 * with zero members lingers in the store/server-browser forever), or `null` if the Syndicate
 * was already gone or every retry lost the race. */
async function removeMember(
  syndicateId: string,
  targetId: string,
  syndicates: ReturnType<typeof getStore>,
): Promise<StoredSyndicate | 'deleted' | null> {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await syndicates.getWithMetadata(syndicateId, { type: 'json' });
    if (!existing) return null;

    const record = normalizeSyndicateRecord(existing.data as StoredSyndicate);
    const memberIds = record.memberIds.filter((id) => id !== targetId);

    if (memberIds.length === 0) {
      await syndicates.delete(syndicateId);
      return 'deleted';
    }

    const coLeaderIds = record.coLeaderIds.filter((id) => id !== targetId);
    const memberNames = { ...record.memberNames };
    delete memberNames[targetId];

    const updated: StoredSyndicate = { ...record, memberIds, coLeaderIds, memberNames };
    const result = await syndicates.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return updated;
    // etag mismatch — retry against the freshest record.
  }
  return null;
}

async function handleLeave(
  user: VerifiedTelegramUser,
  syndicates: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = await membership.get(membershipKey(user.id), { type: 'text' });
  if (!syndicateId) return jsonResponse({ ok: true }); // not in one — no-op, not an error

  await removeMember(syndicateId, user.id, syndicates);
  await membership.delete(membershipKey(user.id));
  return jsonResponse({ ok: true });
}

async function handlePromote(
  user: VerifiedTelegramUser,
  body: PromoteBody,
  syndicates: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : '';
  if (!targetUserId) return jsonResponse({ error: 'targetUserId is required.' }, 400);
  if (targetUserId === user.id) {
    return jsonResponse({ error: 'You cannot promote yourself.' }, 400);
  }

  const syndicateId = await membership.get(membershipKey(user.id), { type: 'text' });
  if (!syndicateId) return jsonResponse({ error: 'You are not in a Syndicate.' }, 400);

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await syndicates.getWithMetadata(syndicateId, { type: 'json' });
    if (!existing) return jsonResponse({ error: 'This Syndicate no longer exists.' }, 404);

    const record = normalizeSyndicateRecord(existing.data as StoredSyndicate);
    // Only the Leader can promote — a Co-Leader is a Deputy, not someone who can appoint
    // more of themselves.
    if (record.leaderId !== user.id) {
      return jsonResponse({ error: 'Only the Leader can promote members.' }, 403);
    }
    if (!record.memberIds.includes(targetUserId)) {
      return jsonResponse({ error: 'That player is not a member of this Syndicate.' }, 400);
    }
    if (record.coLeaderIds.includes(targetUserId)) {
      return jsonResponse({ error: 'That player is already a Co-Leader.' }, 400);
    }

    const updated: StoredSyndicate = { ...record, coLeaderIds: [...record.coLeaderIds, targetUserId] };
    const result = await syndicates.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return jsonResponse(toPublicSyndicate(updated));
    // etag mismatch — retry against the freshest record.
  }

  return jsonResponse({ error: 'Could not promote — please try again.' }, 409);
}

async function handleDemote(
  user: VerifiedTelegramUser,
  body: DemoteBody,
  syndicates: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : '';
  if (!targetUserId) return jsonResponse({ error: 'targetUserId is required.' }, 400);

  const syndicateId = await membership.get(membershipKey(user.id), { type: 'text' });
  if (!syndicateId) return jsonResponse({ error: 'You are not in a Syndicate.' }, 400);

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await syndicates.getWithMetadata(syndicateId, { type: 'json' });
    if (!existing) return jsonResponse({ error: 'This Syndicate no longer exists.' }, 404);

    const record = normalizeSyndicateRecord(existing.data as StoredSyndicate);
    // Only the Leader can demote — a Co-Leader can't strip another Co-Leader's status any
    // more than they can promote one, per the same "Co-Leader is a Deputy, not an appointer"
    // rule as handlePromote above.
    if (record.leaderId !== user.id) {
      return jsonResponse({ error: 'Only the Leader can demote Co-Leaders.' }, 403);
    }
    if (!record.coLeaderIds.includes(targetUserId)) {
      return jsonResponse({ error: 'That player is not a Co-Leader.' }, 400);
    }

    const updated: StoredSyndicate = {
      ...record,
      coLeaderIds: record.coLeaderIds.filter((id) => id !== targetUserId),
    };
    const result = await syndicates.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return jsonResponse(toPublicSyndicate(updated));
    // etag mismatch — retry against the freshest record.
  }

  return jsonResponse({ error: 'Could not demote — please try again.' }, 409);
}

async function handleKick(
  user: VerifiedTelegramUser,
  body: KickBody,
  syndicates: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId : '';
  if (!targetUserId) return jsonResponse({ error: 'targetUserId is required.' }, 400);
  if (targetUserId === user.id) {
    return jsonResponse({ error: 'You cannot kick yourself — use Leave instead.' }, 400);
  }

  const syndicateId = await membership.get(membershipKey(user.id), { type: 'text' });
  if (!syndicateId) return jsonResponse({ error: 'You are not in a Syndicate.' }, 400);

  // A plain (non-CAS) read purely to decide whether the actor is even allowed to kick this
  // target — removeMember() below re-reads the record fresh (with its own CAS/etag retry
  // loop) for the actual mutation, so a race between this check and the real write can never
  // let a stale permission decision stick; worst case this whole request just needs a retry.
  const rawCurrent = (await syndicates.get(syndicateId, { type: 'json' })) as StoredSyndicate | null;
  if (!rawCurrent) return jsonResponse({ error: 'This Syndicate no longer exists.' }, 404);
  const current = normalizeSyndicateRecord(rawCurrent);
  if (!current.memberIds.includes(targetUserId)) {
    return jsonResponse({ error: 'That player is not a member of this Syndicate.' }, 400);
  }

  const isLeader = current.leaderId === user.id;
  const isCoLeader = current.coLeaderIds.includes(user.id);
  if (!isLeader && !isCoLeader) {
    return jsonResponse({ error: 'Only the Leader or a Co-Leader can kick members.' }, 403);
  }
  if (targetUserId === current.leaderId) {
    return jsonResponse({ error: 'The Leader cannot be kicked.' }, 403);
  }
  // The Leader can kick anyone else, including a Co-Leader. A Co-Leader can only kick a
  // regular member — not another Co-Leader, and (per the check above) never the Leader.
  if (!isLeader && current.coLeaderIds.includes(targetUserId)) {
    return jsonResponse({ error: 'A Co-Leader cannot kick another Co-Leader.' }, 403);
  }

  const result = await removeMember(syndicateId, targetUserId, syndicates);
  if (result === null) return jsonResponse({ error: 'Could not kick — please try again.' }, 409);

  // Clear the kicked player's own membership pointer too — otherwise their own next `?mine=1`
  // check would still resolve via the self-heal path above, but only after one extra round
  // trip; clearing it here is just as correct and saves that trip.
  await membership.delete(membershipKey(targetUserId));

  if (result === 'deleted') return jsonResponse({ ok: true, syndicate: null });
  return jsonResponse({ ok: true, syndicate: toPublicSyndicate(result) });
}

async function handlePost(
  req: Request,
  syndicates: ReturnType<typeof getStore>,
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
    case 'create':
      return handleCreate(user, payload as CreateBody, syndicates, membership);
    case 'join':
      return handleJoin(user, payload as JoinBody, syndicates, membership);
    case 'leave':
      return handleLeave(user, syndicates, membership);
    case 'promote':
      return handlePromote(user, payload as PromoteBody, syndicates, membership);
    case 'demote':
      return handleDemote(user, payload as DemoteBody, syndicates, membership);
    case 'kick':
      return handleKick(user, payload as KickBody, syndicates, membership);
    default:
      return jsonResponse(
        { error: 'action must be one of: create, join, leave, promote, demote, kick' },
        400,
      );
  }
}

export default async (req: Request) => {
  // 'strong' consistency trades a little latency for always reading the very latest write,
  // regardless of which region/instance served it — required here because, unlike sync.mts's
  // save data (which tolerates a few seconds of eventual-consistency lag since it's re-polled
  // every 2s anyway), a Syndicate browse or "am I in one" check is a one-shot read with nothing
  // to retry it: under the default 'eventual' mode, another player's just-created Syndicate could
  // genuinely be invisible to a GET landing on a different edge/region moments later, which is
  // exactly the "can't find Syndicates other players made" symptom this fixes.
  const syndicates = getStore({ name: 'syndicates', consistency: 'strong' });
  const membership = getStore({ name: 'syndicate-membership', consistency: 'strong' });

  if (req.method === 'GET') return handleGet(req, syndicates, membership);
  if (req.method === 'POST') return handlePost(req, syndicates, membership);
  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/syndicates',
};
