import { createHmac, timingSafeEqual } from 'node:crypto';

/** Telegram's own guidance: initData older than this is suspicious (a replayed/leaked value
 * rather than a fresh Mini App launch) and should be rejected. Shared by every endpoint that
 * validates initData, so bumping this one day changes the policy everywhere at once. */
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

/** The authenticated identity behind a request, derived entirely from a signature-verified
 * initData string — never from anything else the client sent. `firstName` falls back to a
 * `Runner #1234`-style label (last 4 digits of the id) when Telegram didn't supply one, so every
 * caller of this module gets a display-ready name without repeating that fallback itself. */
export interface VerifiedTelegramUser {
  id: string;
  firstName: string;
}

/** Verifies a Telegram Mini App `initData` string against the bot token per Telegram's
 * documented HMAC scheme (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app),
 * returning the authenticated user on success or `null` on any failure (missing/invalid
 * signature, expired, malformed user field, missing bot token). Without this, any client could
 * read or write another Telegram user's data just by guessing/spoofing their id — every endpoint
 * that touches shared state (Syndicates, Matchmaking, the save-sync backend) must call this and
 * trust nothing about "who is this" except its return value. */
export function verifyInitData(initData: string, botToken: string | undefined): VerifiedTelegramUser | null {
  if (!botToken || !initData) return null;

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

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const computedBuf = Buffer.from(computedHash, 'hex');
  const receivedBuf = Buffer.from(hash, 'hex');
  if (computedBuf.length !== receivedBuf.length || !timingSafeEqual(computedBuf, receivedBuf)) {
    return null;
  }

  const userJson = params.get('user');
  if (!userJson) return null;
  try {
    const user = JSON.parse(userJson) as { id?: unknown; first_name?: unknown };
    if (typeof user.id !== 'number') return null;
    const id = String(user.id);
    const firstName =
      typeof user.first_name === 'string' && user.first_name.length > 0
        ? user.first_name
        : `Runner #${id.slice(-4)}`;
    return { id, firstName };
  } catch {
    return null;
  }
}

/** initData travels in the request body on endpoints that also need to support
 * `navigator.sendBeacon` (no custom headers allowed there — see useCloudSync.ts's
 * pushStateReliably), and in the `x-telegram-init-data` header everywhere else. Every POST
 * handler in this project checks the body first, then falls back to the header, so callers don't
 * need to know which transport a given request came in on. */
export function extractInitData(req: Request, body: { initData?: unknown } | null | undefined): string {
  const bodyInitData = typeof body?.initData === 'string' ? body.initData : '';
  const headerInitData = req.headers.get('x-telegram-init-data') ?? '';
  return bodyInitData || headerInitData;
}
