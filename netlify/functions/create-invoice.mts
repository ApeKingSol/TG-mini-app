import type { Context } from '@netlify/functions';
import { extractInitData, verifyInitData } from './_shared/verifyInitData';
import { createInvoiceLink } from './_shared/telegramBotApi';
import { OVERCLOCK, MEGA_OVERCLOCK } from '../../src/game/config/economy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/** The two Stars-purchasable items right now. Widen this union (and ITEM_CONFIG below) if more
 * Stars items get added later. Price/duration for each come straight from OVERCLOCK/
 * MEGA_OVERCLOCK in src/game/config/economy.ts — the same source the client reads to display
 * them — rather than being re-declared here, so the two can never drift apart. */
type InvoiceItem = 'overclock_24h' | 'mega_overclock_72h' | 'buy_neon_50' | 'buy_neon_200' | 'buy_neon_1000';

const ITEM_CONFIG: Record<InvoiceItem, { title: string; description: string; priceStars: number }> = {
  buy_neon_50: {
    title: '50 NEON Pack',
    description: 'Instantly grants 50 NEON.',
    priceStars: 15,
  },
  buy_neon_200: {
    title: '200 NEON Pack',
    description: 'Instantly grants 200 NEON.',
    priceStars: 49,
  },
  buy_neon_1000: {
    title: '1000 NEON Pack',
    description: 'Instantly grants 1000 NEON.',
    priceStars: 499,
  },
  overclock_24h: {
    title: 'Overclock: 24h Auto-Mechanic',
    description: 'Triples your passive Scrap income for 24 hours.',
    priceStars: OVERCLOCK.STARS_PRICE,
  },
  mega_overclock_72h: {
    title: 'Mega Overclock (72H)',
    description:
      'Triples your passive Scrap income for 72 hours and raises your AFK offline cap to 72 hours while active.',
    priceStars: MEGA_OVERCLOCK.STARS_PRICE,
  },
};

const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_CACHE_HEADERS });
}

/** Creates a real, chargeable Telegram Stars invoice link for the requesting (initData-verified)
 * user and one recognized item. The `payload` embedded in the invoice binds it to *this*
 * verified user id — not anything the client could later spoof — so telegram-webhook.mts's
 * `successful_payment` handler knows exactly what to grant once Telegram confirms the charge.
 * This endpoint only ever creates the invoice; it never grants anything itself; see
 * telegram-webhook.mts for the only place that actually happens. */
export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!BOT_TOKEN) {
    return jsonResponse({ error: 'server misconfigured: TELEGRAM_BOT_TOKEN is not set' }, 500);
  }

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
  if (typeof item !== 'string' || !(item in ITEM_CONFIG)) {
    return jsonResponse({ error: 'unknown item' }, 400);
  }
  const config = ITEM_CONFIG[item as InvoiceItem];

  const invoicePayload = JSON.stringify({ item, userId: user.id });
  if (invoicePayload.length > 128) {
    // Can't happen with the current item/userId shapes, but Telegram hard-rejects anything
    // longer than this, so fail loudly rather than silently sending a doomed request.
    return jsonResponse({ error: 'invoice payload too large' }, 500);
  }

  try {
    const invoiceUrl = await createInvoiceLink(BOT_TOKEN, {
      title: config.title,
      description: config.description,
      payload: invoicePayload,
      currency: 'XTR',
      prices: [{ label: config.title, amount: config.priceStars }],
    });
    return jsonResponse({ invoiceUrl });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Could not create invoice' },
      502,
    );
  }
};

export const config = {
  path: '/api/create-invoice',
};
