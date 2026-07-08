import { motion } from 'framer-motion';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Clock, Lock, type LucideIcon } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';

interface ProfileScreenProps {
  onBack: () => void;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const neon = useGameStore((state) => state.neon);
  const neonHistory = useGameStore((state) => state.neonHistory);

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

      <div className="grid grid-cols-2 gap-3">
        <ActionCard icon={ArrowDownToLine} label="Deposit" />
        <ActionCard icon={ArrowUpFromLine} label="Withdraw" />
      </div>

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
    </motion.div>
  );
}

function ActionCard({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex cursor-not-allowed flex-col items-center gap-2 rounded-xl border border-neutral-800 bg-bg-panel/60 p-4 opacity-60">
      <Icon className="h-6 w-6 text-neutral-400" strokeWidth={1.75} />
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">{label}</p>
      <span className="flex items-center gap-1 rounded-full border border-neutral-700 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-widest text-neutral-500">
        <Lock className="h-3 w-3" strokeWidth={2} />
        Soon
      </span>
    </div>
  );
}
