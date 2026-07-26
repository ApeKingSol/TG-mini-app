import type { Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { answerPreCheckoutQuery } from './_shared/telegramBotApi';
import { OVERCLOCK } from '../../src/game/config/economy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
/** Set this to the same value passed as `secret_token` when registering the webhook with
 * Telegram's `setWebhook` (see this file's own doc comment below for the exact call — this
 * project intentionally never calls setWebhook itself, only the account owner does). */
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const ITEM_PRICES_STARS: Record<string, number> = {
  overclock_24h: OVERCLOCK.STARS_PRICE,
};

interface PreCheckoutQuery {
  id: string;
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  /** Telegram's own unique id for this specific charge — the idempotency key that stops a
   * redelivered webhook from granting the same purchase twice. */
  telegram_payment_charge_id: string;
}

interface TelegramUpdate {
  pre_checkout_query?: PreCheckoutQuery;
  message?: {
    from?: { id: number };
    successful_payment?: SuccessfulPayment;
  };
}

interface InvoicePayload {
  item?: string;
  userId?: string;
}

function parsePayload(raw: string): InvoicePayload | null {
  try {
    return JSON.parse(raw) as InvoicePayload;
  } catch {
    return null;
  }
}

/** Telegram will not release the payment without an `ok` answer here, within 10 seconds of the
 * query arriving — this is the last chance to reject a charge before it actually happens (e.g.
 * a stale/tampered payload, or a price mismatch), not just a formality. */
async function handlePreCheckoutQuery(query: PreCheckoutQuery): Promise<void> {
  const payload = parsePayload(query.invoice_payload);
  const expectedPrice = payload?.item ? ITEM_PRICES_STARS[payload.item] : undefined;
  const valid =
    payload?.item !== undefined &&
    expectedPrice !== undefined &&
    expectedPrice === query.total_amount &&
    query.currency === 'XTR';

  await answerPreCheckoutQuery(
    BOT_TOKEN!,
    query.id,
    valid,
    valid ? undefined : 'This item is no longer available.',
  );
}

/** The only place in this entire project that actually grants the Overclock boost — everything
 * upstream of this (create-invoice.mts, ShopScreen.tsx's openInvoice callback) either sets up
 * the purchase or just observes it; this function runs only once Telegram itself has told us,
 * via an authenticated webhook call, that a specific charge really happened. */
async function handleSuccessfulPayment(payment: SuccessfulPayment, payerId: number): Promise<void> {
  const payload = parsePayload(payment.invoice_payload);
  if (!payload?.item || payload.item !== 'overclock_24h') return; // unrecognized item, nothing to grant

  // Idempotency: Telegram redelivers an update if this endpoint doesn't ack fast enough, and a
  // naive "just extend boostEndsAt" would double- (or triple-, ...) grant on every redelivery of
  // the *same* charge. Reserving this charge id first, and bailing out if it was already
  // reserved, makes the grant below run at most once per real payment.
  const processedPayments = getStore({ name: 'processed-payments', consistency: 'strong' });
  const reserved = await processedPayments.set(
    payment.telegram_payment_charge_id,
    String(payerId),
    { onlyIfNew: true },
  );
  if (!reserved.modified) return; // this exact charge was already handled

  const saves = getStore({ name: 'game-saves', consistency: 'strong' });
  const userId = String(payerId);
  const existing = await saves.getWithMetadata(userId, { type: 'json' });
  // No save on file for this Telegram id yet — this can only happen if someone manages to pay
  // an invoice before ever opening the Mini App for real, which shouldn't be reachable (the
  // invoice itself is only ever created from inside an already-running session). Nothing safe
  // to merge a boost into, so this deliberately does nothing rather than fabricate a save.
  if (!existing) return;

  const record = existing.data as { boostEndsAt?: number | null; [key: string]: unknown };
  const now = Date.now();
  const durationMs = OVERCLOCK.DURATION_HOURS * 60 * 60 * 1000;
  const updated = {
    ...record,
    boostEndsAt: Math.max(now, record.boostEndsAt ?? 0) + durationMs,
    // Bumping lastSaved is what makes useCloudSync.ts's "only adopt remote if newer than
    // local" check actually pick this up on the player's next pull — without it, this write
    // would sit in Blobs forever, invisible to a client that already has an equal/newer save.
    lastSaved: now,
  };
  const result = await saves.setJSON(userId, updated, { onlyIfMatch: existing.etag });
  // A conflicting concurrent write here (another tab open, or a still-in-flight client push)
  // isn't retried — this is a single player's own save, so the next natural pull/push cycle
  // (useCloudSync polls every 2s) will reconcile it on its own; the idempotency guard above
  // only exists to stop *this exact charge* from ever granting twice, not to force delivery.
  void result;
}

/**
 * Receives Telegram Bot API Update objects (https://core.telegram.org/bots/api#update) pushed
 * via webhook — the only place in this project that verifies a Stars payment actually happened
 * and grants what it paid for. Authenticated via the `X-Telegram-Bot-Api-Secret-Token` header
 * Telegram echoes back on every real call, set via `secret_token` when the webhook is
 * registered; without checking it, anyone who found this URL could POST a fake
 * `successful_payment` and grant themselves a free boost.
 *
 * This project's own standing rule is to never call `setWebhook`/`setChatMenuButton` itself —
 * only the account owner registers the bot's webhook. To wire this endpoint up for real, run
 * (with your own bot token and a secret you generate yourself):
 *
 *   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
 *     -H "content-type: application/json" \
 *     -d '{
 *       "url": "https://<your-site>.netlify.app/api/telegram-webhook",
 *       "secret_token": "<the same value you set as TELEGRAM_WEBHOOK_SECRET in Netlify>",
 *       "allowed_updates": ["pre_checkout_query", "message"]
 *     }'
 *
 * and set `TELEGRAM_WEBHOOK_SECRET` as a Netlify environment variable to that same secret
 * (alongside the existing `TELEGRAM_BOT_TOKEN`) before that call — otherwise every real update
 * Telegram sends will be rejected as unauthorized by the check below.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!BOT_TOKEN || !WEBHOOK_SECRET) {
    return new Response('server misconfigured', { status: 500 });
  }

  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  if (secretHeader !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  if (update.pre_checkout_query) {
    await handlePreCheckoutQuery(update.pre_checkout_query);
  } else if (update.message?.successful_payment && update.message.from) {
    await handleSuccessfulPayment(update.message.successful_payment, update.message.from.id);
  }

  // Telegram only needs a 200 to consider this update delivered — always ack, even for update
  // types this endpoint doesn't act on, so it's never redelivered forever.
  return new Response('OK', { status: 200 });
};

export const config = {
  path: '/api/telegram-webhook',
};
