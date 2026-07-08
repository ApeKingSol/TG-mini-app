import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { createHmac, timingSafeEqual } from 'node:crypto';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
/** Telegram's own guidance: initData older than this is suspicious (a replayed/leaked
 * value rather than a fresh Mini App launch) and should be rejected. */
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

/** Verifies a Telegram Mini App `initData` string against the bot token per Telegram's
 * documented HMAC scheme (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
 * returning the authenticated user id on success. Without this, any client could read or
 * overwrite any other Telegram user's save just by guessing/spoofing their id. */
function verifyInitData(initData: string): string | null {
  if (!BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const computedBuf = Buffer.from(computedHash, 'hex');
  const receivedBuf = Buffer.from(hash, 'hex');
  if (computedBuf.length !== receivedBuf.length || !timingSafeEqual(computedBuf, receivedBuf)) {
    return null;
  }

  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    const user = JSON.parse(userJson);
    return typeof user?.id === 'number' ? String(user.id) : null;
  } catch {
    return null;
  }
}

/** GET returns the caller's own saved state (or null if they've never synced), POST
 * overwrites it. Both are scoped strictly to the Telegram user id proven by initData —
 * there's no way to read or write anyone else's save through this endpoint. */
export default async (req: Request, _context: Context) => {
  const initData = req.headers.get('x-telegram-init-data') ?? '';
  const userId = verifyInitData(initData);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'invalid or missing Telegram initData' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const store = getStore('game-saves');

  if (req.method === 'GET') {
    const saved = await store.get(userId, { type: 'json' });
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
    if (!body || typeof body !== 'object' || typeof (body as { lastSaved?: unknown }).lastSaved !== 'number') {
      return new Response(JSON.stringify({ error: 'body must include a numeric lastSaved' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    await store.setJSON(userId, body);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
};

export const config = {
  path: '/api/sync',
};
