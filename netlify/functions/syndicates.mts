import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { extractInitData, verifyInitData } from './_shared/verifyInitData';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_MAX_MEMBERS = 50;
const MAX_WRITE_RETRIES = 5;

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
}

/** The full record as actually stored — `memberIds` is the source of truth `membersCount` is
 * derived from; it never leaves this file. */
interface StoredSyndicate {
  id: string;
  name: string;
  tag: string;
  memberIds: string[];
  maxMembers: number;
  leaderId: string;
}

function toPublicSyndicate(record: StoredSyndicate): Syndicate {
  return {
    id: record.id,
    name: record.name,
    tag: record.tag,
    membersCount: record.memberIds.length,
    maxMembers: record.maxMembers,
    leaderId: record.leaderId,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
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

    const record = await syndicates.get(syndicateId, { type: 'json' });
    if (!record) {
      // The membership pointer outlived the Syndicate it pointed to — self-heal rather than
      // get the caller permanently stuck believing they're in a Syndicate that's gone.
      await membership.delete(membershipKey(user.id));
      return jsonResponse({ syndicate: null });
    }
    return jsonResponse({ syndicate: toPublicSyndicate(record as StoredSyndicate) });
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
type PostBody = CreateBody | JoinBody | LeaveBody;

async function handleCreate(
  user: { id: string },
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
    maxMembers: DEFAULT_MAX_MEMBERS,
    leaderId: user.id,
  };

  const reserved = await membership.set(membershipKey(user.id), record.id, { onlyIfNew: true });
  if (!reserved.modified) {
    return jsonResponse({ error: 'You are already in a Syndicate.' }, 409);
  }

  await syndicates.setJSON(record.id, record);
  return jsonResponse(toPublicSyndicate(record));
}

async function handleJoin(
  user: { id: string },
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

    const updated: StoredSyndicate = { ...record, memberIds: [...record.memberIds, user.id] };
    const result = await syndicates.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return jsonResponse(toPublicSyndicate(updated));
    // etag mismatch — someone else wrote to this Syndicate between our read and write; retry.
  }

  await membership.delete(membershipKey(user.id));
  return jsonResponse({ error: 'Could not join — please try again.' }, 409);
}

async function handleLeave(
  user: { id: string },
  syndicates: ReturnType<typeof getStore>,
  membership: ReturnType<typeof getStore>,
): Promise<Response> {
  const syndicateId = await membership.get(membershipKey(user.id), { type: 'text' });
  if (!syndicateId) return jsonResponse({ ok: true }); // not in one — no-op, not an error

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const existing = await syndicates.getWithMetadata(syndicateId, { type: 'json' });
    if (!existing) break; // already gone — just clear the pointer below

    const record = existing.data as StoredSyndicate;
    const updated: StoredSyndicate = {
      ...record,
      memberIds: record.memberIds.filter((id) => id !== user.id),
    };
    const result = await syndicates.setJSON(syndicateId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) break;
    // etag mismatch — retry against the freshest record.
  }

  await membership.delete(membershipKey(user.id));
  return jsonResponse({ ok: true });
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
    default:
      return jsonResponse({ error: 'action must be one of: create, join, leave' }, 400);
  }
}

export default async (req: Request, _context: Context) => {
  const syndicates = getStore('syndicates');
  const membership = getStore('syndicate-membership');

  if (req.method === 'GET') return handleGet(req, syndicates, membership);
  if (req.method === 'POST') return handlePost(req, syndicates, membership);
  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/syndicates',
};
