import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Rocket,
  Star,
  Timer,
  ArrowRightLeft,
  Coins,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import { WebApp, isRunningInTelegram } from '../lib/telegram';
import {
  OVERCLOCK,
  isOverclockActive,
  NEON_TO_SCRAP_RATE,
  NEON_EXCHANGE_PACKAGES,
} from '../game/config/economy';

const CREATE_INVOICE_ENDPOINT = '/api/create-invoice';

interface ShopModalProps {
  onClose: () => void;
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

/** How long to wait for the Overclock webhook's grant to sync down before giving up on showing
 * a live "Confirming..." state — useCloudSync (mounted once at the app root) polls every ~2s
 * regardless of this modal, so this is generous slack for that plus normal webhook latency, not
 * a tight timeout. Not giving up sooner avoids flashing a wrong "still syncing" message for what
 * is, the overwhelming majority of the time, just two or three ordinary poll cycles. */
const CONFIRMATION_TIMEOUT_MS = 20_000;

/** The Shop: the premium "Overclock: 24h Auto-Mechanic" Telegram Stars boost, and the NEON →
 * Scrap Exchange grid. Replaces the old cosmetic Skin Shop entirely (skins were never actually
 * purchasable — see the removed getCarSkins/CarSkin in carTiers.ts). Mirrors the Garage's other
 * modals (SkinShopModal used to, DailyRewardModal still does) for a visually consistent overlay/
 * panel structure. */
export function ShopModal({ onClose }: ShopModalProps) {
  const neon = useGameStore((state) => state.neon);
  const boostEndsAt = useGameStore((state) => state.boostEndsAt);
  const exchangeNeonForScrap = useGameStore((state) => state.exchangeNeonForScrap);

  const [now, setNow] = useState(() => Date.now());
  const [isPurchasing, setIsPurchasing] = useState(false);
  // Set the instant Telegram's own UI reports the payment succeeded; cleared once boostEndsAt
  // actually changes (see the effect below). There is deliberately no client-side action that
  // sets boostEndsAt directly — see its own doc comment in game/types/index.ts — so this is
  // *waiting for telegram-webhook.mts's write to sync down*, not a fake progress bar standing
  // in for an instant grant.
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const boostEndsAtBeforePurchaseRef = useRef<number | null>(null);
  const [message, setMessage] = useState<{ text: string; variant: 'error' | 'success' } | null>(
    null,
  );

  // The Overclock countdown (if active) needs a live clock of its own — this modal can be left
  // open across the boost expiring, or across a purchase's confirmation window.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const boostActive = isOverclockActive(boostEndsAt, now);

  const showMessage = (text: string, variant: 'error' | 'success' = 'error') => {
    setMessage({ text, variant });
    window.setTimeout(() => setMessage(null), 3500);
  };

  // Detects the moment the webhook's grant actually lands: boostEndsAt genuinely moved past
  // whatever it was right before this purchase. Nothing here *triggers* a sync — useCloudSync's
  // own interval does that on its own regardless of this modal — this just reacts once it does.
  useEffect(() => {
    if (!isConfirmingPayment) return;
    const before = boostEndsAtBeforePurchaseRef.current;
    if (boostEndsAt !== null && (before === null || boostEndsAt > before)) {
      setIsConfirmingPayment(false);
      showMessage('Overclock activated — the Auto-Mechanic is on the clock!', 'success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmingPayment, boostEndsAt]);

  // Gives up *displaying* the wait after a while — not a claim the payment failed (as far as
  // this client knows, Telegram already reported success on-device), just an acknowledgment that
  // sync is taking longer than usual; the grant itself, once the webhook processes it, still
  // lands on its own via the next poll regardless of whether this modal is even still open.
  useEffect(() => {
    if (!isConfirmingPayment) return;
    const timeoutId = window.setTimeout(() => {
      setIsConfirmingPayment(false);
      showMessage('Payment received — still syncing, check back in a moment.', 'success');
    }, CONFIRMATION_TIMEOUT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isConfirmingPayment]);

  /** Kicks off the Telegram Stars checkout: asks the backend for a real invoice URL (backed by
   * Telegram's own createInvoiceLink — see create-invoice.mts), then hands it to Telegram's
   * native payment sheet via WebApp.openInvoice. That callback reporting 'paid' is *not* itself
   * proof of payment (it's the client reporting what its own UI did) — the boost is only ever
   * actually granted server-side, once Telegram separately confirms the charge to
   * telegram-webhook.mts. This just starts waiting for that to sync down. */
  const handleBuyOverclock = async () => {
    if (isPurchasing || isConfirmingPayment) return;
    if (!isRunningInTelegram()) {
      showMessage('Open this from Telegram to buy with Stars.');
      return;
    }

    setIsPurchasing(true);
    try {
      const res = await fetch(CREATE_INVOICE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ initData: WebApp.initData, item: 'overclock_24h' }),
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as
        | { invoiceUrl?: string; error?: string }
        | null;
      if (!res.ok || !body?.invoiceUrl) {
        throw new Error(body?.error || 'Could not start checkout.');
      }

      const invoiceUrl = body.invoiceUrl;
      boostEndsAtBeforePurchaseRef.current = boostEndsAt;
      WebApp.openInvoice(invoiceUrl, (status) => {
        setIsPurchasing(false);
        if (status === 'paid') {
          setIsConfirmingPayment(true);
        } else if (status === 'failed') {
          showMessage('Payment failed — try again.');
        }
        // 'cancelled' / 'pending' — no message; the player just backed out, or Telegram is
        // still resolving it and may fire this callback again.
      });
    } catch (err) {
      setIsPurchasing(false);
      showMessage(err instanceof Error ? err.message : 'Could not start checkout.');
    }
  };

  const handleExchange = (neonAmount: number) => {
    if (!exchangeNeonForScrap(neonAmount)) {
      showMessage('Not enough NEON.');
      return;
    }
    showMessage(
      `Exchanged ${neonAmount.toLocaleString()} NEON for ${(neonAmount * NEON_TO_SCRAP_RATE).toLocaleString()} Scrap.`,
      'success',
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-20 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: -24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -24, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(event) => event.stopPropagation()}
        className="panel-cut w-full max-w-sm border border-neon-cyan/50 bg-bg-panel p-4 text-left shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-display text-sm font-bold uppercase tracking-widest text-neon-cyan">
            Shop
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-500 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            boostActive
              ? 'border-amber bg-amber/10 shadow-[0_0_20px_rgba(255,149,0,0.25)]'
              : 'border-neutral-800 bg-black/20'
          }`}
        >
          <div className="flex items-center gap-1.5 text-amber">
            <Rocket className="h-4 w-4" strokeWidth={2} />
            <p className="font-display text-xs font-bold uppercase tracking-widest">
              Overclock: 24h Auto-Mechanic
            </p>
          </div>
          <p className="mt-1.5 text-xs text-neutral-400">
            Auto-collects Scrap and triples your passive income for 24 hours — the fastest way to
            your next trade-in.
          </p>

          {boostActive && (
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-amber/40 bg-amber/5 py-2.5">
              <Timer className="h-3.5 w-3.5 text-amber" strokeWidth={2} />
              <span className="font-display text-sm font-bold tabular-nums text-amber">
                Active — {formatDuration((boostEndsAt as number) - now)} left
              </span>
            </div>
          )}

          <motion.button
            type="button"
            onClick={handleBuyOverclock}
            disabled={isPurchasing || isConfirmingPayment}
            whileHover={!isPurchasing && !isConfirmingPayment ? { scale: 1.02 } : undefined}
            whileTap={!isPurchasing && !isConfirmingPayment ? { scale: 0.97 } : undefined}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-amber bg-amber/10 py-2.5 font-display text-sm font-black uppercase tracking-widest text-amber shadow-[0_0_16px_rgba(255,149,0,0.3)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPurchasing || isConfirmingPayment ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Star className="h-4 w-4" fill="currentColor" strokeWidth={1.5} />
            )}
            {isPurchasing
              ? 'Processing...'
              : isConfirmingPayment
                ? 'Confirming payment...'
                : boostActive
                  ? `Extend +24h — ${OVERCLOCK.STARS_PRICE}`
                  : `Buy — ${OVERCLOCK.STARS_PRICE}`}
          </motion.button>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-neon-magenta">
            <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2} />
            <p className="font-display text-xs font-bold uppercase tracking-widest">
              Exchange — NEON to Scrap
            </p>
          </div>
          <p className="mt-1 text-[10px] text-neutral-600">
            1 NEON = {NEON_TO_SCRAP_RATE.toLocaleString()} Scrap · one-way, can't convert back.
          </p>

          <div className="mt-2 grid grid-cols-3 gap-2">
            {NEON_EXCHANGE_PACKAGES.map((pkg) => {
              const affordable = neon >= pkg.neon;
              return (
                <motion.button
                  key={pkg.neon}
                  type="button"
                  onClick={() => handleExchange(pkg.neon)}
                  disabled={!affordable}
                  whileHover={affordable ? { scale: 1.05 } : undefined}
                  whileTap={affordable ? { scale: 0.95 } : undefined}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 transition-colors disabled:cursor-not-allowed ${
                    affordable
                      ? 'border-neon-magenta/50 bg-neon-magenta/10'
                      : 'border-neutral-800 bg-black/20 opacity-50'
                  }`}
                >
                  <span className="flex items-center gap-1 font-display text-sm font-bold text-neon-magenta">
                    <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
                    {pkg.neon}
                  </span>
                  <ArrowRightLeft className="h-3 w-3 text-neutral-600" strokeWidth={2} />
                  <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-scrap">
                    <Coins className="h-3 w-3" strokeWidth={2} />
                    {pkg.scrap.toLocaleString()}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {message && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mt-3 text-center text-xs font-bold uppercase tracking-widest ${
                message.variant === 'success' ? 'text-toxic-green' : 'text-danger-red'
              }`}
            >
              {message.text}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
