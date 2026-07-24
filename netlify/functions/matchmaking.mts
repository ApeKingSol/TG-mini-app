import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { extractInitData, verifyInitData } from './_shared/verifyInitData';
import { getLeagueForTier, type LeagueId } from '../../src/game/config/carTiers';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
/** An open race nobody accepted within this window is treated as abandoned (the host closed the
 * app without cancelling) and filtered out of browse results — it isn't deleted, just hidden, so
 * there's no background cleanup job to run. */
const RACE_STALE_MS = 10 * 60 * 1000;
const MAX_WRITE_RETRIES = 5;

type RaceStatus = 'open' | 'matched' | 'cancelled';

/** The full record as actually stored, keyed by its own id. */
interface StoredRace {
  id: string;
  league: LeagueId;
  status: RaceStatus;
  hostId: string;
  hostName: string;
  hostCarTier: number;
  betAmount: number;
  createdAt: number;
  accepterId?: string;
  accepterName?: string;
  accepterCarTier?: number;
}

/** The shape src/game/mock/matchmaking.ts's OpenChallenge already expects — describes "the other
 * side" of a race from whichever perspective it's being read. Browsing shows the host as the
 * opponent; the host's own status poll shows the accepter as the opponent. */
interface OpenChallenge {
  id: string;
  opponentName: string;
  opponentCarTier: number;
  betAmount: number;
}

function toOpenChallengeFromHost(record: StoredRace): OpenChallenge {
  return {
    id: record.id,
    opponentName: record.hostName,
    opponentCarTier: record.hostCarTier,
    betAmount: record.betAmount,
  };
}

function toOpenChallengeFromAccepter(record: StoredRace): OpenChallenge | null {
  if (!record.accepterId || record.accepterCarTier === undefined || !record.accepterName) return null;
  return {
    id: record.id,
    opponentName: record.accepterName,
    opponentCarTier: record.accepterCarTier,
    betAmount: record.betAmount,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** GET ?league=street — every still-open, non-stale race in that league hosted by someone other
 * than the caller (you can't race yourself). Requires initData so "someone other than the
 * caller" is actually meaningful, not just a client-supplied id. */
async function handleGet(req: Request, races: ReturnType<typeof getStore>): Promise<Response> {
  const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  const league = new URL(req.url).searchParams.get('league');
  if (!league) return jsonResponse({ error: 'league query param is required' }, 400);

  const { blobs } = await races.list({ prefix: `${league}:` });
  const records = await Promise.all(
    blobs.map((blob) => races.get(blob.key, { type: 'json' }) as Promise<StoredRace | null>),
  );

  const now = Date.now();
  const challenges = records
    .filter((record): record is StoredRace => record !== null)
    .filter((record) => record.status === 'open')
    .filter((record) => now - record.createdAt <= RACE_STALE_MS)
    .filter((record) => record.hostId !== user.id)
    .map(toOpenChallengeFromHost);

  return jsonResponse({ challenges });
}

/** Every race is stored under `${league}:${id}` so browsing one league can `list({ prefix })`
 * instead of scanning every race that has ever been hosted across all four leagues. */
function raceKey(league: LeagueId, id: string): string {
  return `${league}:${id}`;
}

interface HostBody {
  action: 'host';
  initData?: unknown;
  betAmount?: unknown;
  carTier?: unknown;
}
interface StatusBody {
  action: 'status';
  initData?: unknown;
  matchId?: unknown;
}
interface AcceptBody {
  action: 'accept';
  initData?: unknown;
  matchId?: unknown;
  carTier?: unknown;
}
interface CancelBody {
  action: 'cancel';
  initData?: unknown;
  matchId?: unknown;
}
type PostBody = HostBody | StatusBody | AcceptBody | CancelBody;

async function handleHost(
  user: { id: string; firstName: string },
  body: HostBody,
  races: ReturnType<typeof getStore>,
): Promise<Response> {
  const betAmount = typeof body.betAmount === 'number' ? body.betAmount : NaN;
  const carTier = typeof body.carTier === 'number' ? body.carTier : NaN;
  if (!Number.isFinite(betAmount) || betAmount <= 0 || !Number.isFinite(carTier) || carTier <= 0) {
    return jsonResponse({ error: 'betAmount and carTier must be positive numbers' }, 400);
  }

  const league = getLeagueForTier(carTier).id;
  const record: StoredRace = {
    id: crypto.randomUUID(),
    league,
    status: 'open',
    hostId: user.id,
    hostName: user.firstName,
    hostCarTier: carTier,
    betAmount,
    createdAt: Date.now(),
  };

  await races.setJSON(raceKey(league, record.id), record);
  return jsonResponse({ matchId: record.id });
}

/** matchId alone doesn't say which league prefix a race was stored under, so every lookup by id
 * (status/accept/cancel) has to check all four leagues rather than one direct `get`. Four Blobs
 * reads for an occasional poll/action is a fine trade against storing the league twice or making
 * the client track it. */
async function findRaceById(
  races: ReturnType<typeof getStore>,
  matchId: string,
): Promise<{ key: string; record: StoredRace } | null> {
  const leagues: LeagueId[] = ['street', 'pro', 'elite', 'legend'];
  for (const league of leagues) {
    const key = raceKey(league, matchId);
    const record = (await races.get(key, { type: 'json' })) as StoredRace | null;
    if (record) return { key, record };
  }
  return null;
}

async function handleStatus(
  user: { id: string },
  body: StatusBody,
  races: ReturnType<typeof getStore>,
): Promise<Response> {
  const matchId = typeof body.matchId === 'string' ? body.matchId : '';
  if (!matchId) return jsonResponse({ error: 'matchId is required' }, 400);

  const found = await findRaceById(races, matchId);
  if (!found) return jsonResponse({ status: 'not_found' });
  if (found.record.hostId !== user.id) {
    return jsonResponse({ error: 'Only the host can poll this race.' }, 403);
  }

  if (found.record.status === 'matched') {
    return jsonResponse({ status: 'matched', opponent: toOpenChallengeFromAccepter(found.record) });
  }
  return jsonResponse({ status: found.record.status });
}

async function handleAccept(
  user: { id: string; firstName: string },
  body: AcceptBody,
  races: ReturnType<typeof getStore>,
): Promise<Response> {
  const matchId = typeof body.matchId === 'string' ? body.matchId : '';
  const carTier = typeof body.carTier === 'number' ? body.carTier : NaN;
  if (!matchId || !Number.isFinite(carTier) || carTier <= 0) {
    return jsonResponse({ error: 'matchId and carTier are required' }, 400);
  }

  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    const found = await findRaceById(races, matchId);
    if (!found) return jsonResponse({ error: 'This match is no longer available.' }, 404);
    if (found.record.hostId === user.id) {
      return jsonResponse({ error: "You can't accept your own race." }, 400);
    }
    if (found.record.status !== 'open') {
      return jsonResponse({ error: 'This match is no longer available.' }, 409);
    }

    const existing = await races.getWithMetadata(found.key, { type: 'json' });
    if (!existing) return jsonResponse({ error: 'This match is no longer available.' }, 404);

    const updated: StoredRace = {
      ...found.record,
      status: 'matched',
      accepterId: user.id,
      accepterName: user.firstName,
      accepterCarTier: carTier,
    };
    const result = await races.setJSON(found.key, updated, { onlyIfMatch: existing.etag });
    if (result.modified) return jsonResponse({ opponent: toOpenChallengeFromHost(updated) });
    // etag mismatch — someone else (or another retry of this same request) claimed it first.
  }

  return jsonResponse({ error: 'This match is no longer available.' }, 409);
}

async function handleCancel(
  user: { id: string },
  body: CancelBody,
  races: ReturnType<typeof getStore>,
): Promise<Response> {
  const matchId = typeof body.matchId === 'string' ? body.matchId : '';
  if (!matchId) return jsonResponse({ error: 'matchId is required' }, 400);

  const found = await findRaceById(races, matchId);
  if (!found) return jsonResponse({ ok: true }); // already gone — nothing to cancel
  if (found.record.hostId !== user.id) {
    return jsonResponse({ error: 'Only the host can cancel this race.' }, 403);
  }

  await races.delete(found.key);
  return jsonResponse({ ok: true });
}

async function handlePost(req: Request, races: ReturnType<typeof getStore>): Promise<Response> {
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
    case 'host':
      return handleHost(user, payload as HostBody, races);
    case 'status':
      return handleStatus(user, payload as StatusBody, races);
    case 'accept':
      return handleAccept(user, payload as AcceptBody, races);
    case 'cancel':
      return handleCancel(user, payload as CancelBody, races);
    default:
      return jsonResponse({ error: 'action must be one of: host, status, accept, cancel' }, 400);
  }
}

export default async (req: Request, _context: Context) => {
  const races = getStore('matchmaking-races');

  if (req.method === 'GET') return handleGet(req, races);
  if (req.method === 'POST') return handlePost(req, races);
  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/matchmaking',
};
