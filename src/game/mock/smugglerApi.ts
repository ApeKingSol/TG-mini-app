import { SMUGGLERS_RUN } from '../config/economy';

/**
 * Smuggler's Run API surface. Every exported function here is async (Promise-based) on purpose,
 * even though today only the network delay is real and the RNG roll happens client-side against
 * SMUGGLERS_RUN.SECTORS — that's the shape a real backend (which would own the RNG itself, so a
 * modified client can't fake a "success") would have. Swapping each function's *implementation*
 * for a real network call later shouldn't require changing anything in SmugglersRun.tsx that
 * calls it — same names, same parameters, same return shapes.
 */

const MOCK_START_DELAY_MS = 400;
const MOCK_CASH_OUT_DELAY_MS = 400;

/** Starts a new convoy run server-side for the given entry fee. The fee itself is deducted from
 * $NEON by the caller (via the game store) — this call just simulates the server confirming a
 * run has begun and handing back its id.
 *
 * TODO real backend: `POST /smugglers-run/start { fee }` → the server should verify + deduct the
 * fee itself rather than trusting the client, and return a signed run id used to validate every
 * later resolveSector/cashOutConvoy call against this same run. */
export function startConvoy(fee: number): Promise<{ runId: string }> {
  void fee; // kept in the signature for parity with a real POST body
  const runId = crypto.randomUUID();
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ runId }), MOCK_START_DELAY_MS);
  });
}

/** Rolls whether the convoy clears the given sector. The odds come from
 * SMUGGLERS_RUN.SECTORS — sector 1 is index 0, and so on.
 *
 * TODO real backend: `POST /smugglers-run/:runId/resolve-sector { sectorNumber }` — the roll
 * must happen server-side against the same odds table, never trusting a client-supplied result,
 * or a modified client could simply claim `success: true` every time. */
export function resolveSector(sectorNumber: number): Promise<{ success: boolean }> {
  const sector = SMUGGLERS_RUN.SECTORS[sectorNumber - 1];
  const success = sector !== undefined && Math.random() < sector.successChance;
  return new Promise((resolve) => {
    window.setTimeout(() => resolve({ success }), SMUGGLERS_RUN.RESOLVE_DELAY_MS);
  });
}

/** Claims the payout for the run's current multiplier and ends it safely. The actual $NEON
 * award is credited by the caller (via the game store) — this call just simulates the server
 * confirming the claim.
 *
 * TODO real backend: `POST /smugglers-run/:runId/cash-out` — the server should look up the
 * run's own tracked multiplier rather than trusting whatever value the client sends, and reject
 * a claim against a run that's already busted or already cashed out. */
export function cashOutConvoy(currentMultiplier: number): Promise<{ finalMultiplier: number }> {
  return new Promise((resolve) => {
    window.setTimeout(
      () => resolve({ finalMultiplier: currentMultiplier }),
      MOCK_CASH_OUT_DELAY_MS,
    );
  });
}
