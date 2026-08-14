import type { Context } from '@netlify/functions';
import { getStore } from '../../server/mock-blobs';
import { extractInitData, verifyInitData } from './_shared/verifyInitData';
import { SMUGGLERS_RUN } from '../../src/game/config/economy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON' }, 400);
  }

  const user = verifyInitData(extractInitData(req, body), BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing initData' }, 401);

  const store = getStore('game-saves');
  
  // Note: For real concurrency, we'd use a transaction or CAS (Compare-And-Swap).
  // With mock-blobs we just get and set.
  const state = await store.get(user.id, { type: 'json' });
  if (!state) return jsonResponse({ error: 'Player state not found' }, 404);

  const action = body.action; // 'start', 'resolve-sector', 'cash-out'

  if (action === 'start') {
    const fee = SMUGGLERS_RUN.ENTRY_FEE_NEON;
    if (state.neon < fee) return jsonResponse({ error: 'INSUFFICIENT NEON' }, 400);

    state.neon -= fee;
    const runId = (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
    
    // Track active run in the state itself
    state.activeSmugglersRun = {
      runId,
      multiplier: 1.0,
      fee,
    };
    state.lastSaved = Date.now();
    await store.setJSON(user.id, state);
    
    return jsonResponse({ runId });
  }

  if (action === 'resolve-sector') {
    const run = state.activeSmugglersRun;
    if (!run || run.runId !== body.runId) return jsonResponse({ error: 'invalid run' }, 400);

    const sectorIndex = typeof body.sectorNumber === 'number' ? body.sectorNumber - 1 : -1;
    const sector = SMUGGLERS_RUN.SECTORS[sectorIndex];
    
    if (!sector) return jsonResponse({ error: 'invalid sector' }, 400);

    const success = Math.random() < sector.successChance;
    
    if (success) {
      run.multiplier = sector.rewardMultiplier;
    } else {
      // Busted. Wipe the active run.
      state.activeSmugglersRun = null;
    }
    
    state.lastSaved = Date.now();
    await store.setJSON(user.id, state);

    return jsonResponse({ success });
  }

  if (action === 'cash-out') {
    const run = state.activeSmugglersRun;
    if (!run || run.runId !== body.runId) return jsonResponse({ error: 'invalid run' }, 400);

    // Pay out based on the SERVER's tracked multiplier, not trusting the client.
    const payout = Math.floor(run.fee * run.multiplier);
    state.neon += payout;
    state.activeSmugglersRun = null;
    state.lastSaved = Date.now();
    
    await store.setJSON(user.id, state);

    return jsonResponse({ finalMultiplier: run.multiplier, payout });
  }

  return jsonResponse({ error: 'unknown action' }, 400);
};

export const config = {
  path: '/api/smugglers-run',
};
