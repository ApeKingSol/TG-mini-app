import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Check, Copy, Loader2, Send, Sparkles, Users, Zap } from 'lucide-react';
import { useGameStore, getTelegramUserId } from '../game/store/GameStore';
import { REFERRAL } from '../game/config/economy';
import { fetchReferralsData, submitReferralClaim } from '../game/mock/referralsApi';
import { WebApp } from '../lib/telegram';

/** The bot this Mini App is served from — no leading @, no https://t.me/ prefix. */
const BOT_USERNAME = 'garage_mechanic_bot';

function buildReferralLink(userId: string): string {
  // Use standard t.me/botname?startapp= syntax so Telegram parses it correctly
  // and displays the bot's custom thumbnail image/title in the chat preview.
  return `https://t.me/${BOT_USERNAME}?start=ref_${userId}`;
}

const REFERRAL_SHARE_TEXT =
  'Join me in Cyber-Garage — build your rig, race The Streets, and stack $NEON before the airdrop.';

/** Tailwind doesn't ship a vivid enough "neon purple" of its own for this — arbitrary-value hex
 * keeps the Referral System's $NEON profit visually distinct from every other color already in
 * use here (amber rules banner, magenta/cyan elsewhere in the app, toxic-green claim button),
 * marking it explicitly as *premium* currency the instant you glance at the Vault. */
const NEON_PURPLE = '#b026ff';

interface ReferralsScreenProps {
  onBack: () => void;
}

/** The dedicated "REF" tab — rules banner, the Vault (accumulated, manually-claimed rewards),
 * pending/valid invite counts, and the actual share/copy surface. Reached from its own header
 * button (see App.tsx's ReferralsEntryButton), same outside-the-bottom-nav pattern as
 * ProfileScreen/AirdropScreen. */
export function ReferralsScreen({ onBack }: ReferralsScreenProps) {
  const unclaimedNeon = useGameStore((state) => state.unclaimedNeon);
  const unclaimedScrap = useGameStore((state) => state.unclaimedScrap);
  const validReferralsCount = useGameStore((state) => state.validReferralsCount);
  const totalReferralsCount = useGameStore((state) => state.totalReferralsCount);
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
          totalReferralsCount: data.totalReferralsCount,
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const userId = getTelegramUserId();
  const canClaim = (unclaimedNeon > 0 || unclaimedScrap > 0) && !isClaiming;
  // Invitees who joined via this account's link but haven't (yet) reached Tier 5 — invites
  // themselves have no cap, only the "Invite 3 Friends" Airdrop quest cares about a fixed count,
  // so this is a plain, uncapped pending tally.
  // Allow negative visual math just in case valid > total during an async fetch gap, but cap visual display at 0
  const pendingReferrals = Math.max(0, (totalReferralsCount || 0) - (validReferralsCount || 0));

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

      <motion.div
        animate={{
          boxShadow: [
            '0 0 14px 2px rgba(255,149,0,0.35)',
            '0 0 30px 6px rgba(255,149,0,0.6)',
            '0 0 14px 2px rgba(255,149,0,0.35)',
          ],
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        className="panel-cut relative overflow-hidden border-2 border-amber bg-amber/10 p-4 text-center"
      >
        <div className="flex items-center justify-center gap-1.5 text-amber">
          <Users className="h-4 w-4" strokeWidth={2} />
          <p className="font-display text-sm font-bold uppercase tracking-widest drop-shadow-[0_0_10px_rgba(255,149,0,0.5)]">
            Referral Program
          </p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber/80">
          Invite friends. When they reach Tier 5, BOTH of you unlock a bonus!
        </p>

        <div className="mt-3 flex items-center justify-center gap-5">
          <div className="text-center">
            <p
              style={{ color: NEON_PURPLE, textShadow: `0 0 16px ${NEON_PURPLE}d9` }}
              className="font-display text-3xl font-black tabular-nums"
            >
              +{REFERRAL.MILESTONE_NEON_REWARD}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: `${NEON_PURPLE}b3` }}>
              NEON
            </p>
          </div>
          <div className="h-10 w-px bg-amber/30" />
          <div className="text-center">
            <p className="font-display text-3xl font-black tabular-nums text-amber drop-shadow-[0_0_16px_rgba(255,149,0,0.85)]">
              +{REFERRAL.MILESTONE_SCRAP_REWARD.toLocaleString()}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-amber/70">SCRAP</p>
          </div>
        </div>
      </motion.div>

      {/* The Vault */}
      <div className="panel-cut relative overflow-hidden border-2 border-toxic-green/60 bg-toxic-green/10 p-5">
        <p className="text-center font-mono text-[10px] uppercase tracking-widest text-toxic-green/70">
          Available to Claim
        </p>
        <div className="mt-2 flex items-center justify-center gap-5">
          <div className="text-center">
            <p
              style={{ color: NEON_PURPLE, textShadow: `0 0 10px ${NEON_PURPLE}99` }}
              className="font-display text-2xl font-black tabular-nums"
            >
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

      {/* Invite counts — invites themselves have no cap, only the Airdrop's "Invite 3 Friends"
         quest cares about a fixed count of 3, so these are both plain running totals. */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-neutral-800 bg-bg-panel/60 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-400">
            Friends at Tier 5
          </p>
          <p className="font-display text-sm font-bold tabular-nums text-neon-cyan">
            {validReferralsCount}
          </p>
        </div>
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-wide text-neutral-500">
            Unverified Friends
          </p>
          <p className="font-mono text-xs font-semibold tabular-nums text-amber/80">
            {pendingReferrals} player{pendingReferrals === 1 ? '' : 's'} (Need Tier 5)
          </p>
        </div>
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
