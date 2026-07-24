/**
 * Night Siege API surface. Every exported function here is async (Promise-based) on purpose,
 * even though today only the network delay is real — that's the shape a real backend (which
 * would own the Convoy's actual shared HP pool, aggregate every player's submitted damage, and
 * broadcast the leaderboard) would have. Swapping each function's *implementation* for a real
 * network call later shouldn't require changing anything in NightSiege.tsx that calls it — same
 * names, same parameters, same return shapes.
 */

export interface ConvoyStatus {
  bossId: string;
  maxHp: number;
  currentHp: number;
  /** Server-formatted countdown to the raid window closing, e.g. "04:30:00" — display-only, not
   * parsed/counted down locally. */
  timeRemaining: string;
}

export interface LeaderboardEntry {
  name: string;
  damage: number;
  tier: number;
}

const MOCK_STATUS_DELAY_MS = 400;
const MOCK_SUBMIT_DELAY_MS = 350;
const MOCK_LEADERBOARD_DELAY_MS = 400;

/** Fetches the Convoy's current shared HP and the raid window's remaining time.
 *
 * TODO real backend: `GET /siege/convoy-status` — currentHp/timeRemaining need to come from a
 * server-owned clock and damage ledger, never a locally-tracked value, or two players could
 * each see a stale HP total. */
export function fetchConvoyStatus(): Promise<ConvoyStatus> {
  return new Promise((resolve) => {
    window.setTimeout(
      () =>
        resolve({
          bossId: 'convoy-eclipse-07',
          maxHp: 10_000_000,
          currentHp: 8_500_000,
          timeRemaining: '04:30:00',
        }),
      MOCK_STATUS_DELAY_MS,
    );
  });
}

/** Submits this player's session damage at the end of their 30-second combat window.
 *
 * TODO real backend: `POST /siege/submit-damage { damageAmount }` — the server should validate
 * this is a plausible amount for one 30s window (bounded by DAMAGE_PER_TAP_MAX × a max
 * reasonable tap rate) before adding it to the Convoy's shared HP ledger, rather than trusting
 * the client's number outright. */
export function submitDamage(damageAmount: number): Promise<{ accepted: boolean }> {
  void damageAmount;
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ accepted: true }), MOCK_SUBMIT_DELAY_MS);
  });
}

/** Fetches the top 3 Syndicate attackers by total damage dealt to the current Convoy.
 *
 * TODO real backend: `GET /siege/leaderboard` — a real ranking across every player who's
 * submitted damage this raid, not a fixed mock list. */
export function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return new Promise((resolve) => {
    window.setTimeout(
      () =>
        resolve([
          { name: 'Ghost_88', damage: 482_300, tier: 20 },
          { name: 'RazorFin', damage: 401_150, tier: 18 },
          { name: 'NightCrawler', damage: 375_920, tier: 19 },
        ]),
      MOCK_LEADERBOARD_DELAY_MS,
    );
  });
}
