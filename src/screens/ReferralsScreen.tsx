import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Copy, Loader2, Send, Sparkles, Users, Zap } from 'lucide-react';
import { useGameStore, getTelegramUserId } from '../game/store/GameStore';
import { REFERRAL } from '../game/config/economy';
import { fetchReferralsData, submitReferralClaim } from '../game/mock/referralsApi';
import { WebApp } from '../lib/telegram';

/** Your bot's @username (no leading @, no https://t.me/ prefix) — REQUIRED for the referral
 * link below to actually resolve to your Mini App. Replace this before shipping; left as a
 * placeholder here since it isn't something derivable from anywhere else in this codebase. */
const BOT_USERNAME = 'YourBotUsername';

function buildReferralLink(userId: string): string {
  return `https://t.me/${BOT_USERNAME}/app?startapp=ref_${userId}`;
}

const REFERRAL_SHARE_TEXT =
  'Join me in Cyber-Garage — build your rig, race The Streets, and stack $NEON before the airdrop. Tap in:';

interface ReferralsScreenProps {
  onBack: () => void;
}

/** The dedicated "REF" tab — rules banner, the Vault (accumulated, manually-claimed rewards),
 * invite-progress toward the Airdrop's "Invite 3 Friends" quest, and the actual share/copy
 * surface. Reached from its own header button (see App.tsx's ReferralsEntryButton), same
 * outside-the-bottom-nav pattern as ProfileScreen/AirdropScreen. */
export function ReferralsScreen({ onBack }: ReferralsScreenProps) {
  const unclaimedNeon = useGameStore((state) => state.unclaimedNeon);
  const unclaimedScrap = useGameStore((state) => state.unclaimedScrap);
  const validReferralsCount = useGameStore((state) => state.validReferralsCount);
  const claimReferralRewards = useGameStore((state) => state.claimReferralRewards);
  const refreshReferralsData = useGameStore((state) => state.refreshReferralsData);

  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Force-refreshes the Vault numbers the instant this tab opens, rather than waiting for
  // useCloudSync's next scheduled ~2s poll — best-effort: a failure here just leaves whatever
  // the last regular sync already put in the store, a real (if possibly a few seconds stale)
  // number, never a blank or broken screen.
  useEffect(() => {
    fetchReferralsData()
      .then((data) => {
        refreshReferralsData({
          unclaimedNeon: data.unclaimedNeon,
          unclaimedScrap: data.unclaimedScrap,
          validReferralsCount: data.validReferralsCount,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userId = getTelegramUserId();
  const canClaim = (unclaimedNeon > 0 || unclaimedScrap > 0) && !isClaiming;

  const handleClaim = async () => {
    if (!canClaim) return;
    setIsClaiming(true);
    setClaimError(null);
    try {
      const { neonClaimed, scrapClaimed } = await submitReferralClaim();
      claimReferralRewards(neonClaimed, scrapClaimed);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Claim failed — try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  const referralLink = userId ? buildReferralLink(userId) : null;

  const handleShare = () => {
    if (!referralLink) return;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(REFERRAL_SHARE_TEXT)}`;
    WebApp.openTelegramLink(shareUrl);
  };

  const handleCopy = async () => {
    if (!referralLink) return;
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
        <p className="flex-1 text-center font-display text-sm font-bold uppercase tracking-wide text-amber">
          Referrals
        </p>
        <span className="w-10" aria-hidden="true" />
      </div>

      <div className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-amber">
          <Users className="h-4 w-4" strokeWidth={2} />
          <p className="font-display text-sm font-bold uppercase tracking-widest drop-shadow-[0_0_10px_rgba(255,149,0,0.5)]">
            Referral Program
          </p>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-amber/80">
          Invite friends. When they reach Tier 5, BOTH of you unlock a{' '}
          <span className="font-bold text-amber">
            {REFERRAL.MILESTONE_NEON_REWARD} NEON &amp; {REFERRAL.MILESTONE_SCRAP_REWARD.toLocaleString()}{' '}
            Scrap
          </span>{' '}
          bonus!
        </p>
      </div>

      {/* The Vault */}
      <div className="panel-cut relative overflow-hidden border-2 border-toxic-green/60 bg-toxic-green/10 p-5">
        <span className="pointer-events-none absolute right-2 top-1 select-none font-mono text-[8px] uppercase tracking-widest text-toxic-green/50">
          Vault.01
        </span>
        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-toxic-green/70">
          Available to Claim
        </p>
        <div className="mt-2 flex items-center justify-center gap-5">
          <div className="text-center">
            <p className="font-display text-2xl font-black tabular-nums text-neon-magenta drop-shadow-[0_0_10px_rgba(255,46,230,0.6)]">
              {unclaimedNeon.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">NEON</p>
          </div>
          <div className="h-10 w-px bg-toxic-green/30" />
          <div className="text-center">
            <p className="font-display text-2xl font-black tabular-nums text-scrap drop-shadow-[0_0_10px_rgba(255,183,0,0.4)]">
              {unclaimedScrap.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">SCRAP</p>
          </div>
        </div>

        <motion.button
          type="button"
          onClick={handleClaim}
          disabled={!canClaim}
          whileHover={canClaim ? { scale: 1.02 } : undefined}
          whileTap={canClaim ? { scale: 0.97 } : undefined}
          animate={
            canClaim
              ? {
                  boxShadow: [
                    '0 0 10px 2px rgba(57,255,20,0.4)',
                    '0 0 24px 4px rgba(57,255,20,0.75)',
                    '0 0 10px 2px rgba(57,255,20,0.4)',
                  ],
                }
              : { boxShadow: '0 0 0px 0px rgba(57,255,20,0)' }
          }
          transition={{ duration: 1.6, repeat: canClaim ? Infinity : 0, ease: 'easeInOut' }}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 py-4 font-display text-base font-black uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
            canClaim
              ? 'border-toxic-green bg-toxic-green/15 text-toxic-green'
              : 'border-neutral-700 bg-black/20 text-neutral-500'
          }`}
        >
          {isClaiming ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.5} />
              Claiming...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" strokeWidth={2} />
              Claim Rewards
            </>
          )}
        </motion.button>
        {claimError && <p className="mt-2 text-center text-xs font-medium text-red-400">{claimError}</p>}
      </div>

      {/* Progress toward the Airdrop's "Invite 3 Friends" quest */}
      <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-bg-panel/60 px-4 py-2.5">
        <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-400">
          Friends at Tier 5
        </p>
        <p className="font-display text-sm font-bold tabular-nums text-neon-cyan">
          {Math.min(validReferralsCount, REFERRAL.QUEST_REQUIRED_VALID_REFERRALS)}/
          {REFERRAL.QUEST_REQUIRED_VALID_REFERRALS}
        </p>
      </div>

      {/* Share */}
      {referralLink ? (
        <div className="rounded-xl border border-neon-magenta/50 bg-neon-magenta/10 p-4">
          <div className="flex items-center gap-1.5 text-neon-magenta">
            <Zap className="h-4 w-4" strokeWidth={2} />
            <p className="font-display text-sm font-bold uppercase tracking-wide">Your Referral Link</p>
          </div>
          <p className="mt-1 truncate rounded-lg border border-neutral-800 bg-black/30 px-3 py-2 font-mono text-[11px] text-neutral-400">
            {referralLink}
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
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-bg-panel/60 p-4 text-center">
          <p className="text-xs text-neutral-500">Open this from Telegram to get your referral link.</p>
        </div>
      )}
    </motion.div>
  );
}
