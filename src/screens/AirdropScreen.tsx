import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, ExternalLink, Lock, Rocket } from 'lucide-react';
import { useGameStore, getTelegramUserId } from '../game/store/GameStore';
import {
  QUESTS,
  isQuestComplete,
  getQuestProgressValue,
  type QuestDefinition,
  type QuestProgress,
} from '../game/config/economy';

interface AirdropScreenProps {
  onBack: () => void;
}

/** The $NEON Airdrop hub — a TGE announcement banner and the Airdrop quests (including the
 * Referral System's own "Join or Create a Syndicate" / "Invite 3 Friends" milestones — see the
 * dedicated REF tab, reached from its own header button, for the actual invite link/Vault/claim
 * flow those two quests track). Reached from the header (see App.tsx's AirdropEntryButton), same
 * pattern as ProfileScreen/ReferralsScreen: outside the bottom-nav tab system entirely, not one
 * of BottomNav's ScreenId values. */
export function AirdropScreen({ onBack }: AirdropScreenProps) {
  const walletAddress = useGameStore((state) => state.walletAddress);
  const carTier = useGameStore((state) => state.carTier);
  const racesWon = useGameStore((state) => state.racesWon);
  const syndicateId = useGameStore((state) => state.syndicateId);
  const validReferralsCount = useGameStore((state) => state.validReferralsCount);
  const hasJoinedChannel = useGameStore((state) => state.hasJoinedChannel);
  const verifyChannelSubscription = useGameStore((state) => state.verifyChannelSubscription);
  const claimedQuests = useGameStore((state) => state.claimedQuests);
  const claimQuest = useGameStore((state) => state.claimQuest);

  const progress: QuestProgress = { walletAddress, carTier, racesWon, syndicateId, validReferralsCount, hasJoinedChannel };
  // "Complete" means the on-chain/in-game milestone is met, not that its small NEON bonus has
  // been clicked-and-claimed yet — qualifying for the airdrop allocation is about having done
  // the thing, independent of whether the player remembered to collect the reward for it.
  const completedCount = claimedQuests.length;
  const totalCount = QUESTS.length;
  const allQuestsComplete = completedCount === totalCount;

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
          className="flex items-center gap-1 text-xs font-bold text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Back
        </button>
        <p className="flex-1 text-center font-display text-sm font-bold uppercase tracking-wide text-neon-magenta">
          Airdrop &amp; Quests
        </p>
        <span className="w-10" aria-hidden="true" />
      </div>

      <div className="rounded-xl border border-neon-magenta/40 bg-neon-magenta/10 p-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-neon-magenta">
          <Rocket className="h-4 w-4" strokeWidth={2} />
          <p className="font-display text-sm font-bold uppercase tracking-widest drop-shadow-[0_0_10px_rgba(255,46,230,0.5)]">
            $NEON TGE: Coming Soon
          </p>
        </div>
        <p className="mt-1 text-xs text-neon-magenta/70">
          Complete all quests to participate in the airdrop.
        </p>
      </div>

      <motion.div
        animate={{
          boxShadow: [
            '0 0 10px 2px rgba(0,240,255,0.3)',
            '0 0 22px 4px rgba(0,240,255,0.55)',
            '0 0 10px 2px rgba(0,240,255,0.3)',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className="panel-cut relative overflow-hidden border-2 border-neon-cyan bg-neon-cyan/10 p-4"
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-xs font-bold uppercase tracking-widest text-neon-cyan drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]">
            Quests Completed
          </p>
          <p className="font-display text-xl font-black tabular-nums text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.7)]">
            {completedCount} / {totalCount}
          </p>
        </div>
        <div className="mt-2.5 h-3 w-full overflow-hidden rounded-full border border-neon-cyan/40 bg-black/40">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-magenta"
            animate={{ width: `${(completedCount / totalCount) * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </motion.div>

      <div className="flex flex-col gap-3">
        {allQuestsComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="rounded-2xl border-2 border-toxic-green bg-toxic-green/10 p-6 text-center shadow-[0_0_40px_rgba(57,255,20,0.4)]"
          >
            <p className="text-4xl">🎉</p>
            <p className="mt-2 font-display text-lg font-black uppercase tracking-widest text-toxic-green drop-shadow-[0_0_20px_rgba(57,255,20,0.7)]">
              Status: Qualified!
            </p>
            <p className="mt-1 text-xs font-medium text-toxic-green/80">
              You are participating in the $NEON Airdrop.
            </p>
          </motion.div>
        )}
        {QUESTS.map((quest) => (
          <QuestCard
            key={quest.id}
            quest={quest}
            isComplete={isQuestComplete(quest.id, progress)}
            isClaimed={claimedQuests.includes(quest.id)}
            progressValue={getQuestProgressValue(quest.id, progress)}
            onClaim={() => claimQuest(quest.id)}
          />
        ))}
      </div>
    </motion.div>
  );
}

interface QuestCardProps {
  quest: QuestDefinition;
  isComplete: boolean;
  isClaimed: boolean;
  progressValue: { current: number; target: number };
  onClaim: () => void;
}

function QuestCard({ quest, isComplete, isClaimed, progressValue, onClaim }: QuestCardProps) {
  const canClaim = isComplete && !isClaimed;
  const action = quest.action;
  const hasActionLink = action?.type === 'telegram-link';
  const rewardLabel = [
    quest.neonReward ? `${quest.neonReward.toLocaleString()} NEON` : null,
    quest.scrapReward ? `${quest.scrapReward.toLocaleString()} Scrap` : null,
  ]
    .filter(Boolean)
    .join(' + ');
  const barColorClass = isClaimed
    ? 'bg-toxic-green'
    : isComplete
      ? 'bg-neon-magenta'
      : 'bg-neutral-600';
  const fillPercent =
    progressValue.target > 0 ? Math.min(100, (progressValue.current / progressValue.target) * 100) : 0;

  const openQuestLink = () => {
    if (!hasActionLink) return;

    const telegramWebApp = (
      window as unknown as {
        Telegram?: { WebApp?: { openTelegramLink?: (url: string) => void } };
      }
    ).Telegram?.WebApp;

    if (telegramWebApp?.openTelegramLink) {
      telegramWebApp.openTelegramLink(action.url);
      return;
    }

    window.open(action.url, '_blank', 'noopener,noreferrer');
  };

  const [isVerifying, setIsVerifying] = useState(false);
  const hasJoinedChannel = useGameStore((state) => state.hasJoinedChannel);
  const verifyChannelSubscription = useGameStore((state) => state.verifyChannelSubscription);

  const canInteract = canClaim || (!isComplete && hasActionLink);

  const [hasSubscribed, setHasSubscribed] = useState(false);
  const handleQuestAction = async () => {
    if (!canInteract || isVerifying) return;
    
    if (quest.id === 'subscribe_telegram_channel') {
      if (!isComplete) {
        if (!hasSubscribed) {
          openQuestLink();
          setHasSubscribed(true);
        } else {
          setIsVerifying(true);
          try {
            const myId = getTelegramUserId();
            const res = await fetch('/api/verify-channel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: myId })
            });
            const data = await res.json();
            if (data.verified) {
                verifyChannelSubscription();
            } else {
                alert("Subscription not found. Make sure you joined the channel.");
                // Reset so they can try subscribing again if they want
                setHasSubscribed(false); 
            }
          } catch(err) {
             console.error(err);
             alert("Error verifying subscription.");
          }
          setIsVerifying(false);
        }
      } else {
        onClaim();
      }
    } else {
      openQuestLink();
      onClaim();
    }
  };

  return (
    <div
      className={`rounded-xl border p-4 ${
        isClaimed
          ? 'border-toxic-green/40 bg-toxic-green/5'
          : isComplete
            ? 'border-neon-magenta/50 bg-neon-magenta/10'
            : 'border-neutral-800 bg-bg-panel/60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`font-display text-sm font-bold uppercase tracking-wide ${
              isClaimed ? 'text-toxic-green' : isComplete ? 'text-neon-magenta' : 'text-neutral-300'
            }`}
          >
            {quest.title}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">{quest.description}</p>
        </div>
        <span className="shrink-0 text-right font-display text-sm font-bold tabular-nums text-neon-magenta">
          +{rewardLabel}
        </span>
      </div>

      {/* Per-quest completion indicator — a plain progress bar for every quest, plus a
         current/target fraction for the three quests whose target is more than a single
         boolean flip (Tier 10, 10 Wins, 3 Friends); the two boolean milestones (wallet
         connected, Syndicate joined) just show the bar itself, empty or full. */}
      <div className="mt-2.5">
        {progressValue.target > 1 && (
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-neutral-500">
            <span>Progress</span>
            <span className="tabular-nums text-neutral-400">
              {progressValue.current} / {progressValue.target}
            </span>
          </div>
        )}
        <div className="h-1.5 w-full overflow-hidden rounded-full border border-neutral-800 bg-black/30">
          <motion.div
            className={`h-full rounded-full ${barColorClass}`}
            animate={{ width: `${fillPercent}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      <motion.button
        type="button"
        onClick={handleQuestAction}
        disabled={!canInteract}
        whileHover={canInteract ? { scale: 1.02 } : undefined}
        whileTap={canInteract ? { scale: 0.97 } : undefined}
        className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 py-2 font-display text-xs font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
          isClaimed
            ? 'border-toxic-green/40 bg-toxic-green/5 text-toxic-green/70'
            : isComplete
              ? 'border-neon-magenta bg-neon-magenta/15 text-neon-magenta shadow-[0_0_16px_rgba(255,46,230,0.35)]'
              : hasActionLink
                ? 'border-amber/80 bg-amber/15 text-amber shadow-[0_0_12px_rgba(255,149,0,0.2)]'
                : 'border-neutral-700 bg-black/20 text-neutral-500'
        }`}
      >
        {isVerifying ? (
          'Verifying...'
        ) : isClaimed ? (
          <>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Claimed
          </>
        ) : hasActionLink && !isComplete ? (
          <>
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
            Verify
          </>
        ) : isComplete ? (
          'Claim Reward'
        ) : (
          <>
            <Lock className="h-3.5 w-3.5" strokeWidth={2} />
            In Progress
          </>
        )}
      </motion.button>
    </div>
  );
}
