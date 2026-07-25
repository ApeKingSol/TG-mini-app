import { WebApp, isRunningInTelegram } from '../../lib/telegram';

/**
 * Syndicate API surface — backed by netlify/functions/syndicates.mts (Netlify Blobs, keyed by
 * the Telegram user id proven via initData), the same real cross-device backend pattern as
 * useCloudSync.ts. A created Syndicate genuinely shows up in a later fetchSyndicates() call from
 * *any* device, a joined Syndicate's membersCount genuinely increments for everyone browsing it,
 * and membership genuinely survives switching devices — none of that was true of the old
 * localStorage-backed version this replaces. Function names/parameters/return shapes are
 * unchanged from that version on purpose, so SyndicateHub.tsx didn't need to change at all.
 */

export interface Syndicate {
  id: string;
  name: string;
  tag: string;
  membersCount: number;
  maxMembers: number;
  leaderId: string;
}

export interface Player {
  id: string;
  name: string;
}

const SYNDICATES_ENDPOINT = '/api/syndicates';

interface ErrorBody {
  error?: string;
}

/** Every real endpoint call funnels through here so the "explain what went wrong" behavior
 * (SyndicateHub.tsx uppercases and displays whatever message these Errors carry) is consistent
 * whether the failure was a validation error, a 401, or a malformed response. */
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

/** Outside an actual Telegram client there's no initData to authenticate with, so — same
 * convention as useCloudSync.ts — writes fail with a clear, explainable error instead of
 * whatever a guaranteed-401 fetch would surface. Returns a *rejected Promise* rather than
 * throwing synchronously: every exported function here is typed as returning a Promise, and a
 * bare `.then()/.catch()` caller (e.g. RaceScreen.tsx's matchmaking calls) would never get the
 * chance to attach that `.catch()` if the call itself threw before returning anything. */
function requireTelegram(): Promise<never> {
  return Promise.reject(new Error('Open this from Telegram to use Syndicates.'));
}

/** Fetches every Syndicate that currently exists — a real, shared server browser, not a
 * per-device list. Outside an actual Telegram client there's no initData to authenticate a
 * request with, so this quietly resolves to `[]` (same convention as useCloudSync.ts) rather
 * than firing a request that can only ever 401. */
export function fetchSyndicates(): Promise<Syndicate[]> {
  if (!isRunningInTelegram()) return Promise.resolve([]);
  // `_t` busts any GET cache a Telegram WebView/mobile Safari/intermediate proxy might apply on
  // its own initiative — belt-and-suspenders alongside the server's own Cache-Control: no-store
  // (see syndicates.mts's NO_CACHE_HEADERS) and, more importantly, the store's 'strong'
  // consistency mode there, which is what actually guarantees a just-created Syndicate is visible
  // here rather than just guarding against caching.
  return fetch(`${SYNDICATES_ENDPOINT}?_t=${Date.now()}`, { headers: authHeaders(), cache: 'no-store' })
    .then((response) => parseJsonOrThrow<{ syndicates: Syndicate[] }>(response))
    .then((body) => body.syndicates);
}

/** Returns the current player's own Syndicate, or null if they aren't in one — this is what
 * SyndicateHub.tsx calls on mount to restore the 'active' dashboard after a reload, since
 * membership is real, server-persisted state (the same account opening the app on a different
 * device now sees the same answer, unlike the old localStorage-backed version). */
export function fetchMySyndicate(): Promise<Syndicate | null> {
  if (!isRunningInTelegram()) return Promise.resolve(null);
  return fetch(`${SYNDICATES_ENDPOINT}?mine=1&_t=${Date.now()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  })
    .then((response) => parseJsonOrThrow<{ syndicate: Syndicate | null }>(response))
    .then((body) => body.syndicate);
}

/** Charters a brand-new Syndicate with the current player as its leader and sole member. The
 * server derives the leader's identity from validated initData, never from anything this
 * function sends — see netlify/functions/syndicates.mts's handleCreate. */
export function createSyndicate(name: string, tag: string): Promise<Syndicate> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(SYNDICATES_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'create', name, tag }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<Syndicate>(response));
}

/** Adds the current player to an existing Syndicate by id. The server checks capacity/membership
 * atomically (compare-and-swap against the Blobs entry's etag) so two players joining a
 * near-full Syndicate at the same instant can't both succeed past its cap. */
export function joinSyndicate(syndicateId: string): Promise<Syndicate> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(SYNDICATES_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'join', syndicateId }),
    cache: 'no-store',
  }).then((response) => parseJsonOrThrow<Syndicate>(response));
}

/** Removes the current player from whichever Syndicate they're in. A no-op (not an error) if
 * they aren't in one, same as the previous localStorage-backed version. */
export function leaveSyndicate(): Promise<void> {
  if (!isRunningInTelegram()) return requireTelegram();
  return fetch(SYNDICATES_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData: WebApp.initData, action: 'leave' }),
    cache: 'no-store',
  })
    .then((response) => parseJsonOrThrow<{ ok: true }>(response))
    .then(() => undefined);
}
