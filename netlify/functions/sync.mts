import type { Context } from '@netlify/functions';
import { getStore } from '../../server/mock-blobs';
import { extractInitData, verifyInitData } from './_shared/verifyInitData';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/** GET returns the caller's own saved state (or null if they've never synced), POST
 * overwrites it. Both are scoped strictly to the Telegram user id proven by initData —
 * there's no way to read or write anyone else's save through this endpoint. */
export default async (req: Request) => {
  const store = getStore('game-saves');

  if (req.method === 'GET') {
    const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid or missing Telegram initData' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    const saved = await store.get(user.id, { type: 'json' });
    return new Response(JSON.stringify({ state: saved ?? null }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  if (req.method === 'POST') {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'invalid JSON body' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    // initData travels inside the body (not just the header) because the "push on tab
    // hide" call goes through navigator.sendBeacon, which can't set custom headers —
    // sendBeacon exists specifically because a plain fetch() started right as a page is
    // backgrounded/closed is liable to get cut off before it completes (this was silently
    // losing every save-on-close push on iOS, where backgrounding suspends JS almost
    // immediately, while it happened to still work on desktop).
    const payload = body as { initData?: unknown; state?: unknown } | null;
    const user = verifyInitData(extractInitData(req, payload), BOT_TOKEN);
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid or missing Telegram initData' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    const state = payload?.state;
    if (!state || typeof state !== 'object' || typeof (state as { lastSaved?: unknown }).lastSaved !== 'number') {
      return new Response(JSON.stringify({ error: 'body.state must include a numeric lastSaved' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Last-write-wins guard: refuse to overwrite an existing save with one that isn't
    // strictly newer. This is what stops two devices' polling cycles (or a slow/retried
    // request from the same device) from racing each other and clobbering whichever save
    // happened to land last regardless of which one actually held more progress — the same
    // class of bug that a naive client-side timestamp comparison alone can't fully prevent,
    // since a wiped-storage client's fresh default state also carries a recent-looking
    // `lastSaved`. The client (useCloudSync) adopts the returned `state` on a 409 instead of
    // just dropping the write, so a rejected push still leaves the device caught up.
    const existing = (await store.get(user.id, { type: 'json' })) as { lastSaved?: number } | null;
    if (existing && typeof existing.lastSaved === 'number' && existing.lastSaved >= (state as { lastSaved: number }).lastSaved) {
      return new Response(JSON.stringify({ error: 'stale write rejected', state: existing }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    await store.setJSON(user.id, state);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/sync',
};
