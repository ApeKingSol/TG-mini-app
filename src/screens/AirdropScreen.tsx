import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Copy, Lock, Rocket, Send, Users } from 'lucide-react';
import { useGameStore, getTelegramUserId } from '../game/store/GameStore';
import { QUESTS, isQuestComplete, type QuestDefinition } from '../game/config/economy';
import { WebApp } from '../lib/telegram';

/** Your bot's @username (no leading @, no https://t.me/ prefix) — REQUIRED for the referral
 * link below to actually resolve to your Mini App. Replace this before shipping; left as a
 * placeholder here since it isn't something derivable from anywhere else in this codebase. */
const BOT_USERNAME = 'YourBotUsername';

function buildReferralLink(userId: string): string {
  return `https://t.me/${BOT_USERNAME}/app?startapp=ref_${userId}`;
}

const REFERRAL_SHARE_TEXT =
  "Join me in Cyber-Garage — build your rig, race The Streets, and stack $NEON before the airdrop. Tap in:";

interface AirdropScreenProps {
  onBack: () => void;
}

/** The $NEON Airdrop hub — a TGE announcement banner and the 3 Airdrop quests. Reached from the
 * header (see App.tsx's AirdropEntryButton), same pattern as ProfileScreen: outside the bottom-
 * nav tab system entirely, not one of BottomNav's ScreenId values. */
export function AirdropScreen({ onBack }: AirdropScreenProps) {
  const walletAddress = useGameStore((state) => state.walletAddress);
  const carTier = useGameStore((state) => state.carTier);
  const racesWon = useGameStore((state) => state.racesWon);
  const claimedQuests = useGameStore((state) => state.claimedQuests);
  const claimQuest = useGameStore((state) => state.claimQuest);

  const progress = { walletAddress, carTier, racesWon };
  // "Complete" means the on-chain/in-game milestone is met, not that its small NEON bonus has
  // been clicked-and-claimed yet — qualifying for the airdrop allocation is about having done
  // the thing, independent of whether the player remembered to collect the reward for it.
  const completedCount = QUESTS.filter((quest) => isQuestComplete(quest.id, progress)).length;
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
          Complete quests to increase your allocation.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-bg-panel/60 px-4 py-2.5">
        <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-400">
          Quest Progress
        </p>
        <p className="font-display text-sm font-bold tabular-nums text-neon-cyan">
          {completedCount}/{totalCount} Quests
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {allQuestsComplete ? (
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
        ) : (
          QUESTS.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              isComplete={isQuestComplete(quest.id, progress)}
              isClaimed={claimedQuests.includes(quest.id)}
              onClaim={() => claimQuest(quest.id)}
            />
          ))
        )}
        <InviteFriendsCard />
      </div>
    </motion.div>
  );
}

/** Not one of QUESTS (no isComplete/claimedQuests entry, no NEON reward button) — attributing a
 * real referral (crediting the *inviter* once someone actually joins via their link) needs
 * server-side tracking this doesn't have yet: whoever opens the app with `?startapp=ref_X` would
 * have to be verified and matched back to X on the backend, the same way Syndicates/Matchmaking
 * moved off client-trusted state earlier. Until that exists, this is honestly just the share
 * surface — Share and Copy actually work right now, a reward for successful invites doesn't. */
function InviteFriendsCard() {
  const [copied, setCopied] = useState(false);
  const userId = getTelegramUserId();

  if (!userId) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-bg-panel/60 p-4">
        <div className="flex items-center gap-1.5 text-neutral-400">
          <Users className="h-4 w-4" strokeWidth={2} />
          <p className="font-display text-sm font-bold uppercase tracking-wide">Invite Friends</p>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Open this from Telegram to get your referral link.
        </p>
      </div>
    );
  }

  const referralLink = buildReferralLink(userId);

  const handleShare = () => {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(REFERRAL_SHARE_TEXT)}`;
    WebApp.openTelegramLink(shareUrl);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked (permissions, insecure context) — Share is still a
      // fully working fallback, so this fails silently rather than surfacing an error.
    }
  };

  return (
    <div className="rounded-xl border border-neon-magenta/50 bg-neon-magenta/10 p-4">
      <div className="flex items-center gap-1.5 text-neon-magenta">
        <Users className="h-4 w-4" strokeWidth={2} />
        <p className="font-display text-sm font-bold uppercase tracking-wide">Invite Friends</p>
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        Bring your crew into the Syndicate — every runner you pull in raises your standing before
        the TGE.
      </p>

      <div className="mt-3 flex gap-2">
        <motion.button
          type="button"
          onClick={handleShare}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-neon-magenta bg-neon-magenta/15 py-2.5 font-display text-xs font-black uppercase tracking-widest text-neon-magenta shadow-[0_0_16px_rgba(255,46,230,0.35)]"
        >
          <Send className="h-3.5 w-3.5" strokeWidth={2} />
          Share
        </motion.button>
        <motion.button
          type="button"
          onClick={handleCopy}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 py-2.5 font-display text-xs font-black uppercase tracking-widest transition-colors ${
            copied
              ? 'border-toxic-green bg-toxic-green/15 text-toxic-green'
              : 'border-neutral-700 bg-black/20 text-neutral-300'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              Copy Link
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}

interface QuestCardProps {
  quest: QuestDefinition;
  isComplete: boolean;
  isClaimed: boolean;
  onClaim: () => void;
}

function QuestCard({ quest, isComplete, isClaimed, onClaim }: QuestCardProps) {
  const canClaim = isComplete && !isClaimed;

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
        <span className="shrink-0 font-display text-sm font-bold tabular-nums text-neon-magenta">
          +{quest.neonReward}
        </span>
      </div>

      <motion.button
        type="button"
        onClick={onClaim}
        disabled={!canClaim}
        whileHover={canClaim ? { scale: 1.02 } : undefined}
        whileTap={canClaim ? { scale: 0.97 } : undefined}
        className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 py-2 font-display text-xs font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
          isClaimed
            ? 'border-toxic-green/40 bg-toxic-green/5 text-toxic-green/70'
            : isComplete
              ? 'border-neon-magenta bg-neon-magenta/15 text-neon-magenta shadow-[0_0_16px_rgba(255,46,230,0.35)]'
              : 'border-neutral-700 bg-black/20 text-neutral-500'
        }`}
      >
        {isClaimed ? (
          <>
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Claimed
          </>
        ) : isComplete ? (
          'Claim Reward'
        ) : (
          <>
            <Lock className="h-3.5 w-3.5" strokeWidth={2} />
            Locked
          </>
        )}
      </motion.button>
    </div>
  );
}
