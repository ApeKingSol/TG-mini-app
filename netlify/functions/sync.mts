import type { Context } from '@netlify/functions';
import { getStore } from '../../server/mock-blobs';
import { extractInitData, verifyInitData } from './_shared/verifyInitData';
import { supabase } from '../../server/supabase';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/** GET returns the caller's own saved state (or null if they've never synced), POST
 * overwrites it. Both are scoped strictly to the Telegram user id proven by initData —
 * there's no way to read or write anyone else's save through this endpoint. */
export default async (req: Request) => {
  try {
  const store = getStore('game-saves');

  if (req.method === 'GET') {
    const user = verifyInitData(req.headers.get('x-telegram-init-data') ?? '', BOT_TOKEN);
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid or missing Telegram initData' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    const saved = (await store.get(user.id, { type: 'json' })) as Record<string, any> | null;

    if (saved && (saved.syndicateId === undefined || saved.syndicateId === null) && supabase) {
      try {
        const { data } = await supabase.from('profiles').select('syndicate_id').eq('id', user.id).maybeSingle();
        if (data?.syndicate_id) {
          saved.syndicateId = data.syndicate_id;
        }
      } catch {}
    }

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

    const state = payload?.state as Record<string, any> | undefined;
    if (!state || typeof state !== 'object' || typeof state.lastSaved !== 'number') {
      return new Response(JSON.stringify({ error: 'body.state must include a numeric lastSaved' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Explicitly normalize and attach syndicateId field
    const syndicateId = state.syndicateId ?? state.syndicate_id ?? null;
    state.syndicateId = syndicateId;

    // Last-write-wins guard: refuse to overwrite an existing save with one that isn't
    // strictly newer.
    const existing = (await store.get(user.id, { type: 'json' })) as { lastSaved?: number } | null;
    if (existing && typeof existing.lastSaved === 'number' && existing.lastSaved >= state.lastSaved) {
      return new Response(JSON.stringify({ error: 'stale write rejected', state: existing }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }

    await store.setJSON(user.id, state);

    if (supabase) {
      await supabase.from('profiles').upsert(
        { id: user.id, syndicate_id: syndicateId, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      ).catch((err) => {
        console.warn('[sync.mts] Supabase profile upsert warning:', err);
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e), stack: e.stack }), { status: 500 });
  }
};

export const config = {
  path: '/api/sync',
};
