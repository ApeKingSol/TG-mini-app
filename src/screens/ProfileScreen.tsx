import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TonConnectButton, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import {
  ArrowLeft,
  ArrowUpFromLine,
  Clock,
  Lock,
  RefreshCw,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import type { CloudSyncStatus } from '../hooks/useCloudSync';

interface ProfileScreenProps {
  onBack: () => void;
  syncStatus: CloudSyncStatus;
  onSyncNow: () => void;
}

const WITHDRAW_LOCKED_MESSAGE =
  'Withdrawals of $NEON will unlock after the official TGE (Token Generation Event). Stack your NEON now!';

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** UQ…xyz1 style truncation for a wallet address too long to show in full inside a small card. */
function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

export function ProfileScreen({ onBack, syncStatus, onSyncNow }: ProfileScreenProps) {
  const neon = useGameStore((state) => state.neon);
  const neonHistory = useGameStore((state) => state.neonHistory);
  const scrap = useGameStore((state) => state.scrap);
  const storeWalletAddress = useGameStore((state) => state.walletAddress);
  const setWalletAddress = useGameStore((state) => state.setWalletAddress);

  const [message, setMessage] = useState<string | null>(null);

  // TonConnectUIProvider (see main.tsx) owns the actual connection *on this device*.
  // useTonAddress() only ever reflects a session this exact browser/app instance holds — it
  // knows nothing about a wallet linked from a different device, and correctly returns '' the
  // very first time this device has never connected one itself.
  //
  // Bug this guards against: naively doing `setWalletAddress(liveTonAddress || null)`
  // unconditionally clobbered a walletAddress that had just arrived via cross-device sync (e.g.
  // linked on a Mac, opened on an iPhone that has never connected a wallet locally) back to null
  // the instant this screen mounted on the *other* device — because that device's own
  // useTonAddress() is legitimately empty, but that emptiness doesn't mean "the player has no
  // wallet," just "not connected *here*." hasConnectedLocallyRef tracks whether *this* mount
  // ever actually saw a real local connection; only then does a later empty value get treated as
  // a genuine disconnect worth writing back to the store. Until that happens, a synced address
  // from elsewhere is left alone.
  const liveTonAddress = useTonAddress();
  const hasConnectedLocallyRef = useRef(false);
  useEffect(() => {
    if (liveTonAddress) {
      hasConnectedLocallyRef.current = true;
      setWalletAddress(liveTonAddress);
    } else if (hasConnectedLocallyRef.current) {
      setWalletAddress(null);
    }
  }, [liveTonAddress, setWalletAddress]);

  const hasWallet = storeWalletAddress !== null;
  // Genuinely connected right here vs. just known-synced-from-elsewhere. Both render the exact
  // same address card (storeWalletAddress is identical either way, since it's the synced,
  // cross-device value) — the *only* difference is whether a Disconnect control shows up too,
  // since only a device with a real local session has anything to actually disconnect.
  const isConnectedOnThisDevice = liveTonAddress !== '';
  const [tonConnectUI] = useTonConnectUI();

  const handleWithdrawClick = () => {
    setMessage(WITHDRAW_LOCKED_MESSAGE);
    window.setTimeout(() => setMessage(null), 4000);
  };

  const handleDisconnect = () => {
    void tonConnectUI.disconnect();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-neutral-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back
        </button>
        <p className="flex-1 text-center font-display text-sm font-bold uppercase tracking-wide text-neon-cyan">
          Player Profile
        </p>
        <span className="w-10" aria-hidden="true" />
      </div>

      <div className="rounded-xl border border-neon-magenta/40 bg-neon-magenta/10 p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-neon-magenta/80">
          Syndicate Balance
        </p>
        <p className="mt-1 font-display text-3xl font-bold tabular-nums text-neon-magenta drop-shadow-[0_0_10px_rgba(255,46,230,0.5)]">
          {neon} NEON
        </p>
      </div>

      <div className={hasWallet ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-neon-cyan/40 bg-neon-cyan/5 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-neon-cyan">TON Wallet</p>
          {hasWallet ? (
            // Same card, same address, on every device — storeWalletAddress is the one synced,
            // cross-device value, so this never depends on whether *this* device is the one that
            // actually holds the live TonConnect session. Disconnect is the only thing that does:
            // it only appears where there's a real local session to actually tear down.
            <>
              <div className="flex items-center gap-1.5 rounded-lg border border-neon-cyan/30 bg-black/30 px-3 py-1.5">
                <Wallet className="h-3.5 w-3.5 shrink-0 text-neon-cyan" strokeWidth={2} />
                <span className="font-mono text-xs text-neon-cyan">
                  {truncateAddress(storeWalletAddress)}
                </span>
              </div>
              {isConnectedOnThisDevice && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-[9px] uppercase tracking-widest text-neutral-600 underline decoration-dotted underline-offset-2 hover:text-neutral-400"
                >
                  Disconnect
                </button>
              )}
            </>
          ) : (
            <TonConnectButton />
          )}
        </div>
        {hasWallet && (
          <LockedActionButton icon={ArrowUpFromLine} label="Withdraw" onClick={handleWithdrawClick} />
        )}
      </div>

      <AnimatePresence>
        {message && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-center text-xs font-medium text-amber"
          >
            {message}
          </motion.p>
        )}
      </AnimatePresence>

      <SyncStatusPanel status={syncStatus} localScrap={scrap} onSyncNow={onSyncNow} />

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-widest text-neutral-500">
          <Clock className="h-3.5 w-3.5" strokeWidth={2} />
          History
        </p>
        {neonHistory.length === 0 ? (
          <p className="rounded-xl border border-neutral-800 bg-bg-panel p-4 text-center text-xs text-neutral-600">
            No transactions yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {neonHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-bg-panel px-3 py-2"
              >
                <div>
                  <p className="text-sm text-neutral-200">{entry.label}</p>
                  <p className="text-[10px] text-neutral-600">{formatTimestamp(entry.timestamp)}</p>
                </div>
                <span
                  className={`font-display text-sm tabular-nums ${
                    entry.amount >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {entry.amount >= 0 ? '+' : ''}
                  {entry.amount} NEON
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-neutral-700">Build {__BUILD_ID__}</p>
    </motion.div>
  );
}

function formatClock(timestamp: number | null): string {
  if (timestamp === null) return '—';
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface SyncStatusPanelProps {
  status: CloudSyncStatus;
  localScrap: number;
  onSyncNow: () => void;
}

/** Deliberately visible/diagnostic rather than a subtle icon — cross-device sync is a
 * background process nobody (including us, debugging it remotely) can otherwise see into.
 * Comparing Local vs "Server saw" Scrap directly answers the most common failure mode at a
 * glance: if they match, sync is working and the two devices just haven't happened to
 * exchange data yet; if "Server saw" is stuck at an old number even after Sync Now, the push
 * side is failing; if it's null, this device has never successfully reached the backend at
 * all — most often because it's still running a cached build from before this feature
 * existed, not a logic bug. */
function SyncStatusPanel({ status, localScrap, onSyncNow }: SyncStatusPanelProps) {
  if (!status.enabled) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4 text-center text-xs text-neutral-500">
        Cross-device sync only runs inside the real Telegram app.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-bg-panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-neutral-500">Device Sync</p>
        <motion.button
          type="button"
          onClick={onSyncNow}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95, rotate: 180 }}
          className="flex items-center gap-1 rounded-md border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1 text-[10px] font-semibold text-neon-cyan"
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2} />
          Sync Now
        </motion.button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <span className="text-neutral-500">Local Scrap</span>
        <span className="text-right tabular-nums text-neutral-200">{Math.floor(localScrap)}</span>

        <span className="text-neutral-500">Server saw</span>
        <span className="text-right tabular-nums text-neutral-200">
          {status.remoteScrapAtLastPull === null ? '—' : Math.floor(status.remoteScrapAtLastPull)}
        </span>

        <span className="text-neutral-500">Last pull</span>
        <span
          className={`text-right ${status.lastPullOk === false ? 'text-red-400' : 'text-neutral-200'}`}
        >
          {formatClock(status.lastPullAt)} {status.lastPullOk === false && '(failed)'}
        </span>

        <span className="text-neutral-500">Last push</span>
        <span
          className={`text-right ${status.lastPushOk === false ? 'text-red-400' : 'text-neutral-200'}`}
        >
          {formatClock(status.lastPushAt)} {status.lastPushOk === false && '(failed)'}
        </span>
      </div>

      {status.lastError && (
        <p className="mt-2 text-center text-[10px] text-red-400">{status.lastError}</p>
      )}
    </div>
  );
}

interface LockedActionButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

/** Still visually "locked" (matches the old Deposit/Withdraw ActionCard look) but genuinely
 * clickable now — Withdraw needs to explain *why* it's locked (the TGE message), not just show
 * a static "Soon" badge with nothing behind it. */
function LockedActionButton({ icon: Icon, label, onClick }: LockedActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-xl border border-neutral-800 bg-bg-panel/60 p-4 opacity-80 transition-opacity hover:opacity-100"
    >
      <Icon className="h-6 w-6 text-neutral-400" strokeWidth={1.75} />
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">{label}</p>
      <span className="flex items-center gap-1 rounded-full border border-neutral-700 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-neutral-500">
        <Lock className="h-3 w-3" strokeWidth={2} />
        Soon
      </span>
    </button>
  );
}
