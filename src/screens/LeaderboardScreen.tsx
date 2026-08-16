import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Medal, ArrowLeft, Loader2, Award } from 'lucide-react';
import { getTelegramUserId } from '../game/store/GameStore';

interface LeaderboardEntry {
  id: string;
  name: string;
  racesWon: number;
  walletAddress: string | null;
}

export function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const myId = getTelegramUserId();

  useEffect(() => {
    fetch('/api/leaderboard')
      .then(res => { if (!res.ok) throw new Error("Network error"); return res.json(); })
      .then(data => {
        if (data.leaderboard) {
          setLeaderboard(data.leaderboard);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

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
          className="flex w-16 items-center gap-1 text-xs font-bold text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Back
        </button>
        <p className="flex-1 text-center font-display text-sm font-bold uppercase tracking-wide text-neon-cyan flex items-center justify-center gap-1.5">
          <Trophy className="h-4 w-4" />
          Leaderboard
        </p>
        <div className="w-16" />
      </div>

      <div className="rounded-2xl border border-neon-cyan/30 bg-neon-cyan/5 p-4 text-center backdrop-blur-sm">
        <p className="font-display text-sm font-bold leading-relaxed text-neon-cyan drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
          🔥 TOP 10 PLAYERS WIN EXCLUSIVE TON DROPS!<br/>
          <span className="mt-1 block font-mono text-[10px] uppercase text-neon-cyan/80">
            Win PvP races in Auto-Drag to climb the ranks!
          </span>
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-neon-cyan/50" />
          <p className="mt-4 animate-pulse font-mono text-xs uppercase tracking-widest text-neon-cyan/50">
            Fetching Rankings...
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 pb-10">
          {leaderboard.map((entry, index) => {
            const isTop10 = index < 10;
            const isMe = String(entry.id) === String(myId);

            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center gap-3 rounded-xl border p-3 backdrop-blur-md ${
                  isTop10
                    ? 'border-neon-cyan/40 bg-neon-cyan/10 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                    : 'border-neutral-800 bg-white/5'
                } ${isMe ? 'ring-1 ring-neon-cyan/50' : ''}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/40 font-display font-bold">
                  {index === 0 ? (
                    <Medal className="h-5 w-5 text-amber" />
                  ) : index === 1 ? (
                    <Medal className="h-5 w-5 text-neutral-300" />
                  ) : index === 2 ? (
                    <Medal className="h-5 w-5 text-amber-700" />
                  ) : (
                    <span className="text-xs text-neutral-500">{index + 1}</span>
                  )}
                </div>
                
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-bold text-neutral-200">
                    {entry.name} {isMe && <span className="text-neon-cyan">(You)</span>}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-500">
                    <Award className="h-3 w-3 text-neon-cyan/70" />
                    <span>{entry.racesWon.toLocaleString()} Wins</span>
                  </div>
                </div>

                {isTop10 && entry.walletAddress && (
                   <div className="flex flex-col items-end justify-center">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-neon-pink drop-shadow-[0_0_4px_rgba(255,0,255,0.4)]">
                        Eligible
                      </span>
                   </div>
                )}
              </motion.div>
            );
          })}
          
          {leaderboard.length === 0 && (
            <div className="py-10 text-center text-xs text-neutral-500">
              No races won yet. Be the first!
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
