import { WebApp, isRunningInTelegram } from '../../lib/telegram';
import type { LeagueId } from '../config/carTiers';

/**
 * Auto-Drag matchmaking API surface — backed by netlify/functions/matchmaking.mts (Netlify
 * Blobs, keyed by the Telegram user id proven via initData), the same real cross-device backend
 * pattern as useCloudSync.ts and syndicateApi.ts. A hosted race genuinely shows up in another
 * player's fetchLobbyMatches() call from any device, accepting one genuinely claims it (a second
 * player racing for the same slot gets a real "no longer available" rejection instead of both
 * silently winning), and the host genuinely finds out via polling instead of never resolving.
 * Function names/parameters/return shapes match the previous mock as closely as the real
 * cross-device flow allows — acceptMatchFromDatabase gained one new parameter (see below) since
 * the server needs to know the accepter's own car tier, not just the host's.
 */

export interface OpenChallenge {
  id: string;
  opponentName: string;
  opponentCarTier: number;
  betAmount: number;
}

const MATCHMAKING_ENDPOINT = '/api/matchmaking';
/** How often a host polls for someone having accepted their race — same order of magnitude as
 * useCloudSync.ts's pull interval, a reasonable "feels responsive without hammering the
 * endpoint" cadence for something that isn't a true live WebSocket push. */
const STATUS_POLL_INTERVAL_MS = 2500;

interface ErrorBody {
  error?: string;
}

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

/** Outside an actual Telegram client there's no initData to authenticate with. Returns a
 * *rejected Promise* rather than throwing synchronously: hostMatchToDatabase/
 * acceptMatchFromDatabase are called via bare `.then()/.catch()` in RaceScreen.tsx, not
 * try/catch — a synchronous throw would happen before `.catch()` ever got attached and blow up
 * the click handler instead of surfacing as a normal rejection. */
function requireTelegram(): Promise<never> {
  return Promise.reject(new Error('Open this from Telegram to race other players.'));
}

/** Fetches the current list of open (joinable) hosted matches for a league, hosted by someone
 * other than the caller. Outside an actual Telegram client there's no initData to authenticate
 * with, so this quietly resolves to `[]` (same convention as useCloudSync.ts/syndicateApi.ts)
 * instead of firing a request that can only ever 401. */
export function fetchLobbyMatches(leagueId: LeagueId): Promise<OpenChallenge[]> {
  if (!isRunningInTelegram()) return Promise.resolve([]);
  // `_t` busts any GET cache a Telegram WebView/mobile Safari/intermediate proxy might apply on
  // its own initiative — belt-and-suspenders alongside the server's own Cache-Control: no-store
  // (see matchmaking.mts's NO_CACHE_HEADERS) and, more importantly, the store's 'strong'
  // consistency mode there, which is what actually guarantees a just-hosted race is visible here
  // rather than just guarding against caching.
  const url = `${MATCHMAKING_ENDPOINT}?league=${encodeURIComponent(leagueId)}&_t=${Date.now()}`;
  return fetch(url, { headers: authHeaders(), cache: 'no-store' })
    .then((response) => parseJsonOrThrow<{ challenges: OpenChallenge[] }>(response))
    .then((body) => body.challenges);
}

/** Creates a hosted match server-side and returns its id. Resolving this promise is what flips
 * the lobby UI over to "Waiting for Opponent..." — it does NOT wait for an opponent itself, see
 * subscribeToMatchResult for that part. The server derives the host's own name/id from validated
 * initData and computes the League from playerTier itself (see getLeagueForTier in
 * netlify/functions/matchmaking.mts), so there's nothing here for a client to spoof. */
export function hostMatchToDatabase(
  betAmount: number,
  playerTier: number,
): Promise<{ matchId: string }> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(MATCHMAKING_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      initData: WebApp.initData,
      action: 'host',
      betAmount,
      carTier: playerTier,
    }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<{ matchId: string }>(response));
}

/** Polls the server for a real opponent having accepted this hosted match — there's no
 * WebSocket/push channel here, just a fixed interval, which is honest about this being "checks
 * every couple seconds" rather than instant. Returns a cancel function that stops polling *and*
 * tells the server to close the hosted match, so a player backing out of hosting doesn't leave a
 * ghost listing other players can still see (the server also self-expires stale ones, but an
 * explicit cancel is immediate). */
export function subscribeToMatchResult(
  matchId: string,
  onMatched: (opponent: OpenChallenge) => void,
): () => void {
  let cancelled = false;

  const poll = () => {
    if (cancelled) return;
    fetch(MATCHMAKING_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: WebApp.initData, action: 'status', matchId }),
      cache: 'no-store',
    })
      .then((response) => parseJsonOrThrow<{ status: string; opponent?: OpenChallenge }>(response))
      .then((body) => {
        if (cancelled) return;
        if (body.status === 'matched' && body.opponent) {
          cancelled = true;
          onMatched(body.opponent);
          return;
        }
        intervalId = window.setTimeout(poll, STATUS_POLL_INTERVAL_MS);
      })
      .catch(() => {
        // A transient failure here just means "try again on the next tick" — the host is still
        // sitting on the "Waiting for Opponent..." screen either way.
        if (!cancelled) intervalId = window.setTimeout(poll, STATUS_POLL_INTERVAL_MS);
      });
  };

  let intervalId = window.setTimeout(poll, STATUS_POLL_INTERVAL_MS);

  return () => {
    cancelled = true;
    window.clearTimeout(intervalId);
    fetch(MATCHMAKING_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: WebApp.initData, action: 'cancel', matchId }),
      cache: 'no-store',
    }).catch(() => {});
  };
}

/** Accepts an already-listed open match by id. The server claims the match atomically (compare-
 * and-swap against the Blobs entry's etag), so if two players both hit Accept on the same race
 * within the same instant, only one succeeds — the other genuinely gets "no longer available"
 * instead of a race condition silently letting both through. `carTier` is new versus the old
 * mock version of this function: the accepter's tier has to reach the server somehow so the
 * *host's* status poll can show an honest opponent car tier instead of a guess — see
 * RaceScreen.tsx's handleAcceptMatch, the one call site, for where it's threaded through. */
export function acceptMatchFromDatabase(matchId: string, carTier: number): Promise<OpenChallenge> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(MATCHMAKING_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'accept', matchId, carTier }),
    cache: 'no-store',
  })
    .then((response) => parseJsonOrThrow<{ opponent: OpenChallenge }>(response))
    .then((body) => body.opponent);
}
