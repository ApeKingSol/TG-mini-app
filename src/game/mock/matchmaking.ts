import type { LeagueId } from '../config/carTiers';

/**
 * Auto-Drag matchmaking API surface. Every exported function here is async (Promise-based) on
 * purpose, even though today only the network delay is real — that's the shape a real backend
 * (REST endpoints + a realtime channel for live updates) would have. Swapping each function's
 * *implementation* for a real network call later shouldn't require changing anything in
 * RaceScreen.tsx/PlayerLobby.tsx that calls it — same names, same parameters, same return shapes.
 *
 * Nothing in this file fabricates opponents, names, tiers, or bots. An empty league genuinely
 * has no open matches until a real player hosts one — the empty-state UI in PlayerLobby.tsx is
 * the actual, correct state until a real database is wired up.
 */

export interface OpenChallenge {
  id: string;
  opponentName: string;
  opponentCarTier: number;
  betAmount: number;
}

const MOCK_NETWORK_DELAY_MS = 500;
const MOCK_ACCEPT_DELAY_MS = 350;
const MOCK_HOST_CREATE_DELAY_MS = 400;

/** Fetches the current list of open (joinable) hosted matches for a league. Strictly resolves
 * to whatever the backend actually has — right now that's always `[]`, since there is no real
 * backend behind this yet and this file generates no fake rows.
 *
 * TODO real backend: query by league id instead of resolving empty, e.g. `GET /matches?league=`,
 * and consider a live-updating subscription here too so the lobby list doesn't rely solely on
 * the manual Refresh button in PlayerLobby.tsx —
 *   - WebSocket:  socket.on(`lobby:${leagueId}:updated`, (list) => setOpenChallenges(list))
 *   - Polling:    useEffect(() => { const id = setInterval(() => fetchLobbyMatches(leagueId).then(...), 5000);
 *                                   return () => clearInterval(id); }, [leagueId])
 */
export function fetchLobbyMatches(leagueId: LeagueId): Promise<OpenChallenge[]> {
  void leagueId; // kept in the signature for parity with a real GET query param
  return new Promise((resolve) => {
    window.setTimeout(() => resolve([]), MOCK_NETWORK_DELAY_MS);
  });
}

/** Creates a hosted match server-side and returns its id. Resolving this promise is what flips
 * the lobby UI over to "Waiting for Opponent..." — it does NOT wait for an opponent itself, see
 * subscribeToMatchResult for that part. */
export function hostMatchToDatabase(
  betAmount: number,
  playerTier: number,
): Promise<{ matchId: string }> {
  void betAmount; // kept in the signature for parity with a real POST body
  void playerTier;
  const matchId = crypto.randomUUID();
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ matchId }), MOCK_HOST_CREATE_DELAY_MS);
  });
}

/** Waits for a real opponent to accept this hosted match. There is intentionally no mock
 * resolution here — until a real backend is wired up, a hosted match simply waits, exactly as it
 * honestly would in production before any other player has joined it. Returns a cancel function
 * so the host can back out of the wait (a real backend would close/delete the hosted match
 * server-side on cancel instead of just tearing down a local subscription).
 *
 * TODO real backend: replace this stub with a live subscription —
 *   - WebSocket:        socket.on(`match:${matchId}:accepted`, onMatched)
 *   - Firestore/RTDB:   onSnapshot(doc(db, 'matches', matchId), (snap) => { if (snap.data()?.status === 'accepted') onMatched(snap.data().opponent); })
 *   - Polling fallback: setInterval(() => fetch(`/api/matches/${matchId}`).then(...), 3000)
 */
export function subscribeToMatchResult(
  matchId: string,
  onMatched: (opponent: OpenChallenge) => void,
): () => void {
  void matchId;
  void onMatched;
  return () => {};
}

/** Accepts an already-listed open match by id. A real backend would claim the match
 * server-side (so two players can't both accept the same one) and return the confirmed
 * opponent, rejecting if it's already gone. There is no local match table here to check
 * against — since fetchLobbyMatches never fabricates rows, there is nothing to accept yet. */
export function acceptMatchFromDatabase(matchId: string): Promise<OpenChallenge> {
  void matchId;
  return new Promise((_resolve, reject) => {
    window.setTimeout(() => {
      reject(new Error('This match is no longer available.'));
    }, MOCK_ACCEPT_DELAY_MS);
  });
}
