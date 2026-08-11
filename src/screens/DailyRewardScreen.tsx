import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Flame, Gift, Loader2, Sparkles, X } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import {
  DAILY_REWARDS,
  DAILY_REWARD_STREAK_RESET_HOURS,
  getDailyRewardForStreak,
  isDailyRewardClaimable,
  type DailyRewardTier,
} from '../game/config/economy';

interface DailyRewardScreenProps {
  /** Consecutive claims completed so far (0 if never claimed). */
  streak: number;
  lastClaim: number | null;
  onClose: () => void;
  /** Fired right after a successful claim with a ready-to-display confirmation message —
   * GarageScreen closes the modal and hands this straight to its existing toast. */
  onClaimed: (message: string) => void;
}

/** `09H 53M` — always two digits each side, uppercase unit letters, no colon. */
function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}H ${String(minutes).padStart(2, '0')}M`;
}

/** The 7-Day Streak Daily Reward track — Days 1-6 escalating Scrap, Day 7 a distinct $NEON
 * payout, cycling forever past Day 7 (see DAILY_REWARDS/getDailyRewardForStreak in economy.ts).
 * Mirrors ShopScreen.tsx's ShopModal overlay/panel structure so the Garage's two header buttons
 * open visually consistent modals. A streak more than DAILY_REWARD_STREAK_RESET_HOURS (48h)
 * stale resets back to Day 1 on the next claim — see claimDailyReward in GameStore.ts, which is
 * the actual source of truth this preview mirrors. */
export function DailyRewardScreen({ streak, lastClaim, onClose, onClaimed }: DailyRewardScreenProps) {
  const claimDailyReward = useGameStore((state) => state.claimDailyReward);
  const [now, setNow] = useState(() => Date.now());
  const [isClaiming, setIsClaiming] = useState(false);

  // The countdown to "next claim opens" needs a live clock of its own — this modal can be left
  // open across that boundary.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const claimable = isDailyRewardClaimable(lastClaim, now);
  // What the *next* claim would actually grant — mirrors the store's own continue-vs-reset
  // check (see claimDailyReward in GameStore.ts) purely for this preview; the real claim always
  // recomputes and commits it authoritatively, this can never itself grant anything.
  const streakBroken =
    lastClaim !== null && now - lastClaim > DAILY_REWARD_STREAK_RESET_HOURS * 60 * 60 * 1000;
  const upcomingStreak = lastClaim === null || streakBroken ? 1 : streak + 1;
  const upcomingDay = getDailyRewardForStreak(upcomingStreak).day;

  const msUntilClaimable = lastClaim === null ? 0 : Math.max(0, lastClaim + 24 * 60 * 60 * 1000 - now);

  const handleClaim = () => {
    if (!claimable || isClaiming) return;
    setIsClaiming(true);
    const reward = claimDailyReward();
    setIsClaiming(false);
    if (!reward) return;
    const amount = reward.scrap ? `+${reward.scrap.toLocaleString()} Scrap` : `+${reward.neon} NEON`;
    onClaimed(`Day ${reward.day} claimed — ${amount}!`);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-16 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: -24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -24, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        onClick={(event) => event.stopPropagation()}
        className="panel-cut w-full max-w-sm border border-amber/50 bg-bg-panel p-4 text-left shadow-lg"
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-widest text-amber">
            <Gift className="h-4 w-4" strokeWidth={2} />
            7-Day Streak
          </p>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-500 hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-center gap-1.5 text-neutral-400">
          <Flame className={`h-3.5 w-3.5 ${streak > 0 ? 'text-amber' : 'text-neutral-600'}`} />
          <p className="text-xs">
            {streak > 0 ? (
              <>
                <span className="font-bold text-amber">{streak}</span>-day streak
              </>
            ) : (
              'No streak yet'
            )}
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {DAILY_REWARDS.map((tier) => (
            <DailyRewardDayCell key={tier.day} tier={tier} isUpcoming={tier.day === upcomingDay} />
          ))}
        </div>

        <motion.button
          type="button"
          onClick={handleClaim}
          disabled={!claimable || isClaiming}
          whileHover={claimable && !isClaiming ? { scale: 1.02 } : undefined}
          whileTap={claimable && !isClaiming ? { scale: 0.97 } : undefined}
          animate={
            claimable && !isClaiming
              ? {
                  boxShadow: [
                    '0 0 10px 2px rgba(255,149,0,0.4)',
                    '0 0 26px 5px rgba(255,149,0,0.75)',
                    '0 0 10px 2px rgba(255,149,0,0.4)',
                  ],
                }
              : { boxShadow: '0 0 0px 0px rgba(255,149,0,0)' }
          }
          transition={{ duration: 1.6, repeat: claimable && !isClaiming ? Infinity : 0, ease: 'easeInOut' }}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 py-5 font-display text-lg font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
            claimable
              ? 'border-amber bg-amber/15 text-amber'
              : 'border-neutral-700 bg-black/20 text-neutral-500'
          }`}
        >
          {isClaiming ? (
            <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2.5} />
          ) : claimable ? (
            <>
              <Sparkles className="h-6 w-6" strokeWidth={2} />
              Claim Reward
            </>
          ) : (
            `Next Reward In ${formatCountdown(msUntilClaimable)}`
          )}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

interface DailyRewardDayCellProps {
  tier: DailyRewardTier;
  isUpcoming: boolean;
}

function DailyRewardDayCell({ tier, isUpcoming }: DailyRewardDayCellProps) {
  const isNeonDay = tier.neon !== undefined;

  return (
    <motion.div
      animate={isUpcoming ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={{ duration: 1.8, repeat: isUpcoming ? Infinity : 0, ease: 'easeInOut' }}
      className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 ${
        isUpcoming
          ? 'border-amber bg-amber/15 shadow-[0_0_14px_rgba(255,149,0,0.5)]'
          : 'border-neutral-800 bg-black/20'
      }`}
    >
      <p className="text-[9px] uppercase tracking-widest text-neutral-500">D{tier.day}</p>
      {isNeonDay ? (
        <Sparkles className={`h-3.5 w-3.5 ${isUpcoming ? 'text-neon-magenta' : 'text-neutral-600'}`} />
      ) : (
        <Coins className={`h-3.5 w-3.5 ${isUpcoming ? 'text-scrap' : 'text-neutral-600'}`} />
      )}
      <p
        className={`text-center text-[9px] font-bold tabular-nums ${
          isUpcoming ? (isNeonDay ? 'text-neon-magenta' : 'text-scrap') : 'text-neutral-600'
        }`}
      >
        {tier.scrap !== undefined ? tier.scrap.toLocaleString() : tier.neon}
      </p>
    </motion.div>
  );
}
