import { getTelegramUserId } from '../store/GameStore';

/**
 * Syndicate API surface. Every exported function is async (Promise-based) on purpose, matching
 * the shape a real backend would have — but unlike a plain `setTimeout`-that-returns-a-constant
 * mock, the actual create/join/leave state is real: it's read from and written to `localStorage`,
 * so a created Syndicate genuinely shows up in a later fetchSyndicates() call, a joined
 * Syndicate's membersCount genuinely increments, and membership genuinely survives a page
 * reload. The one thing this can't simulate is a *shared* server: localStorage is per-browser,
 * so "all Syndicates" here really means "every Syndicate created on this device." Swapping each
 * function's *implementation* for a real network call later shouldn't require changing anything
 * in SyndicateHub.tsx that calls it — same names, same parameters, same return shapes.
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

/** One Syndicate record as actually stored — `memberIds` is the source of truth `membersCount`
 * is derived from; it never leaves this file (the public `Syndicate` shape above omits it). */
interface StoredSyndicate extends Syndicate {
  memberIds: string[];
}

const SYNDICATES_STORAGE_KEY = 'cyber-garage-syndicates';
const DEFAULT_MAX_MEMBERS = 50;
const MOCK_NETWORK_DELAY_MS = 400;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), MOCK_NETWORK_DELAY_MS));
}

function fail(message: string): Promise<never> {
  return new Promise((_resolve, reject) => {
    window.setTimeout(() => reject(new Error(message)), MOCK_NETWORK_DELAY_MS);
  });
}

/** The current player's identity — the same Telegram user id the game save itself is keyed by
 * (see GameStore.ts), so Syndicate membership can never drift out of sync with which save is
 * actually loaded. Falls back to a shared 'guest' identity outside Telegram, same as the save. */
function getCurrentPlayer(): Player {
  const telegramUserId = getTelegramUserId();
  const firstName = readTelegramFirstName();
  return {
    id: telegramUserId ?? 'guest',
    name: firstName ?? (telegramUserId ? `Runner #${telegramUserId.slice(-4)}` : 'Runner'),
  };
}

/** Reads the Telegram user's first name directly from `window`, defensively — same reasoning
 * as GameStore's getTelegramUserId: this can run before the useTelegram hook ever mounts, and
 * must not throw outside an actual Telegram client. */
function readTelegramFirstName(): string | null {
  try {
    const name = (
      window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { user?: { first_name?: string } } } };
      }
    ).Telegram?.WebApp?.initDataUnsafe?.user?.first_name;
    return typeof name === 'string' && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

function readSyndicates(): StoredSyndicate[] {
  try {
    const raw = localStorage.getItem(SYNDICATES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSyndicate[]) : [];
  } catch {
    return [];
  }
}

function writeSyndicates(records: StoredSyndicate[]): void {
  try {
    localStorage.setItem(SYNDICATES_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // localStorage can throw in privacy modes / disabled storage — the caller's own copy of
    // `records` still reflects the change for the rest of this session even if it doesn't
    // persist across reloads.
  }
}

function getMembershipStorageKey(playerId: string): string {
  return `cyber-garage-syndicate-membership-${playerId}`;
}

function readMembershipId(playerId: string): string | null {
  try {
    return localStorage.getItem(getMembershipStorageKey(playerId));
  } catch {
    return null;
  }
}

function writeMembershipId(playerId: string, syndicateId: string | null): void {
  try {
    const key = getMembershipStorageKey(playerId);
    if (syndicateId) localStorage.setItem(key, syndicateId);
    else localStorage.removeItem(key);
  } catch {
    // see writeSyndicates
  }
}

function toPublicSyndicate(record: StoredSyndicate): Syndicate {
  const { memberIds: _memberIds, ...syndicate } = record;
  return syndicate;
}

/** Fetches every Syndicate that currently exists (on this device — see the file-level doc
 * comment on why that's the real scope of a localStorage-backed mock). Full Syndicates are
 * still included, same as a real server browser would, just not joinable. */
export function fetchSyndicates(): Promise<Syndicate[]> {
  return delay(readSyndicates().map(toPublicSyndicate));
}

/** Returns the current player's own Syndicate, or null if they aren't in one — this is what
 * SyndicateHub.tsx calls on mount to restore the 'active' dashboard after a reload, since
 * membership is real, persisted state, not something that should reset every time the app
 * opens.
 *
 * TODO real backend: `GET /syndicates/me` — the server should be the one deciding this from a
 * real membership table, not a client-readable localStorage key. */
export function fetchMySyndicate(): Promise<Syndicate | null> {
  const playerId = getCurrentPlayer().id;
  const syndicateId = readMembershipId(playerId);
  if (!syndicateId) return delay(null);

  const record = readSyndicates().find((entry) => entry.id === syndicateId);
  if (!record) {
    // The membership pointer outlived the Syndicate it pointed to (e.g. localStorage was
    // cleared for just one of the two keys) — self-heal rather than get stuck.
    writeMembershipId(playerId, null);
    return delay(null);
  }
  return delay(toPublicSyndicate(record));
}

/** Charters a brand-new Syndicate with the current player as its leader and sole member.
 *
 * TODO real backend: `POST /syndicates { name, tag }` — the server should own uniqueness
 * checks (tag collisions), the Scrap deduction, and the leader assignment, never trusting the
 * client's own name/tag text outright. */
export function createSyndicate(name: string, tag: string): Promise<Syndicate> {
  const trimmedName = name.trim();
  const trimmedTag = tag.trim().toUpperCase();
  if (!trimmedName || !trimmedTag) {
    return fail('Name and tag are required.');
  }

  const player = getCurrentPlayer();
  if (readMembershipId(player.id)) {
    return fail('You are already in a Syndicate.');
  }

  const record: StoredSyndicate = {
    id: crypto.randomUUID(),
    name: trimmedName,
    tag: trimmedTag,
    membersCount: 1,
    maxMembers: DEFAULT_MAX_MEMBERS,
    leaderId: player.id,
    memberIds: [player.id],
  };

  const records = readSyndicates();
  records.push(record);
  writeSyndicates(records);
  writeMembershipId(player.id, record.id);

  return delay(toPublicSyndicate(record));
}

/** Adds the current player to an existing Syndicate by id.
 *
 * TODO real backend: `POST /syndicates/:id/join` — the server should atomically check
 * capacity/membership itself (a real concurrent-join race isn't something a single-tab mock
 * needs to worry about, but a real one does). */
export function joinSyndicate(syndicateId: string): Promise<Syndicate> {
  const player = getCurrentPlayer();
  if (readMembershipId(player.id)) {
    return fail('You are already in a Syndicate.');
  }

  const records = readSyndicates();
  const record = records.find((entry) => entry.id === syndicateId);
  if (!record) {
    return fail('This Syndicate no longer exists.');
  }
  if (record.memberIds.includes(player.id)) {
    return fail('You are already a member of this Syndicate.');
  }
  if (record.membersCount >= record.maxMembers) {
    return fail('This Syndicate is full.');
  }

  record.memberIds.push(player.id);
  record.membersCount = record.memberIds.length;
  writeSyndicates(records);
  writeMembershipId(player.id, record.id);

  return delay(toPublicSyndicate(record));
}

/** Removes the current player from whichever Syndicate they're in. A no-op (not an error) if
 * they aren't in one.
 *
 * TODO real backend: `POST /syndicates/leave` — and decide what happens to a Syndicate the
 * leader leaves (reassign, disband, ...); this mock just leaves it leaderless, out of scope for
 * a localStorage stand-in. */
export function leaveSyndicate(): Promise<void> {
  const player = getCurrentPlayer();
  const syndicateId = readMembershipId(player.id);
  if (!syndicateId) return delay(undefined);

  const records = readSyndicates();
  const record = records.find((entry) => entry.id === syndicateId);
  if (record) {
    record.memberIds = record.memberIds.filter((id) => id !== player.id);
    record.membersCount = record.memberIds.length;
    writeSyndicates(records);
  }
  writeMembershipId(player.id, null);

  return delay(undefined);
}
