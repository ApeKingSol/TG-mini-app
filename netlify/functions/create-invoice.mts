import type { Context } from '@netlify/functions';
import { extractInitData, verifyInitData } from './_shared/verifyInitData';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/** The only Stars-purchasable item right now — see OVERCLOCK in src/game/config/economy.ts for
 * price/duration. Widen this union (and the price table below) if more Stars items get added
 * later, rather than hardcoding a single item's price inline. */
type InvoiceItem = 'overclock_24h';

const ITEM_PRICES_STARS: Record<InvoiceItem, number> = {
  overclock_24h: 150,
};

const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_CACHE_HEADERS });
}

/**
 * PLACEHOLDER — this does not create a real, chargeable Telegram Stars invoice yet. It exists so
 * ShopScreen.tsx has a real endpoint to call (with real initData auth) rather than a client-side
 * stub, but it always answers 501 rather than fabricating a fake invoice URL that would silently
 * "succeed" without ever charging anyone — same "never fake a success state" rule this project
 * has followed for every other not-yet-real backend piece (matchmaking, Syndicates, before they
 * got real Netlify Functions of their own).
 *
 * A real implementation needs, in order:
 *
 * 1. Call Telegram's Bot API `createInvoiceLink`
 *    (https://core.telegram.org/bots/api#createinvoicelink) from here, server-side, with
 *    `currency: 'XTR'` (Telegram Stars) and `prices: [{ label: 'Overclock 24h', amount:
 *    ITEM_PRICES_STARS.overclock_24h }]`, authenticated with TELEGRAM_BOT_TOKEN. That call
 *    returns the invoice URL this function should hand back as `invoiceUrl` instead of the 501
 *    below.
 *
 * 2. A webhook (or long-polling `getUpdates` loop) that receives Telegram's `pre_checkout_query`
 *    update for this invoice and answers it within 10 seconds via `answerPreCheckoutQuery` —
 *    Telegram will not complete the payment without this.
 *
 * 3. That same webhook/poll handling the `successful_payment` message that follows a completed
 *    payment. THIS — not ShopScreen.tsx's openInvoice callback — is the only trustworthy signal
 *    that money actually changed hands, since it's authenticated by Telegram calling *your*
 *    server, not the client self-reporting a status. Grant the boost here: write `boostEndsAt`
 *    into the same Netlify Blobs `game-saves` store sync.mts already reads/writes, keyed by the
 *    payment's `from.id` (the *Telegram-reported* payer, not anything the client sent).
 *
 * ShopScreen.tsx currently grants the boost immediately on step 2's client-side callback
 * reporting 'paid' instead of waiting on step 3's server-side confirmation — that's the
 * explicitly-requested fast path for now, but it means a modified client could fire that
 * callback without ever paying. Treat this as a known, flagged gap, not a finished purchase
 * flow, until steps 2-3 exist.
 *
 * Registering the actual webhook with Telegram (`setWebhook`) is intentionally left undone here
 * — per this project's own standing rule, only the account owner does that themselves.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400);
  }

  const payload = body as { initData?: unknown; item?: unknown } | null;
  const user = verifyInitData(extractInitData(req, payload), BOT_TOKEN);
  if (!user) return jsonResponse({ error: 'invalid or missing Telegram initData' }, 401);

  const item = payload?.item;
  if (typeof item !== 'string' || !(item in ITEM_PRICES_STARS)) {
    return jsonResponse({ error: 'unknown item' }, 400);
  }

  return jsonResponse(
    {
      error:
        'Stars checkout is not wired up yet — this endpoint is a placeholder. See this function\'s doc comment for exactly what a real implementation needs (createInvoiceLink + a pre_checkout_query/successful_payment webhook).',
    },
    501,
  );
};

export const config = {
  path: '/api/create-invoice',
};
