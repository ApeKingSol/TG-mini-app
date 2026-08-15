/** Thin wrapper around Telegram's Bot API — every real endpoint (create-invoice.mts,
 * telegram-webhook.mts) that needs to talk to Telegram *as the bot* (as opposed to verifying an
 * initData string a client sent, see verifyInitData.ts) goes through here, so the request shape
 * and error handling stay identical everywhere it's used. */

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

async function callTelegramApi<T>(botToken: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`${TELEGRAM_API_BASE}${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as TelegramApiResponse<T>;
  if (!json.ok || json.result === undefined) {
    throw new Error(json.description || `Telegram API ${method} failed`);
  }
  return json.result;
}

export interface CreateInvoiceLinkParams {
  title: string;
  description: string;
  /** Our own opaque data, echoed back verbatim on `successful_payment` — 1-128 bytes. This is
   * how the webhook learns *what* was bought without trusting anything the client says at
   * confirmation time; see telegram-webhook.mts. */
  payload: string;
  /** 'XTR' for Telegram Stars — the only currency this project's invoices use. */
  currency: 'XTR';
  prices: { label: string; amount: number }[];
}

/** https://core.telegram.org/bots/api#createinvoicelink — returns the invoice URL to hand to
 * the client's `WebApp.openInvoice`. */
export function createInvoiceLink(botToken: string, params: CreateInvoiceLinkParams): Promise<string> {
  return callTelegramApi<string>(botToken, 'createInvoiceLink', params);
}

/** https://core.telegram.org/bots/api#answerprecheckoutquery — Telegram will not complete a
 * Stars payment unless this is called within 10 seconds of the `pre_checkout_query` update. */
export function answerPreCheckoutQuery(
  botToken: string,
  preCheckoutQueryId: string,
  ok: boolean,
  errorMessage?: string,
): Promise<true> {
  return callTelegramApi<true>(botToken, 'answerPreCheckoutQuery', {
    pre_checkout_query_id: preCheckoutQueryId,
    ok,
    ...(errorMessage ? { error_message: errorMessage } : {}),
  });
}

export function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<unknown> {
  return callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}
