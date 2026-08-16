import type { PartPerk } from '../config/parts';

export interface CarState {
  id: string;
  name: string;
}

/** The 4-Core race-performance stats, derived from carTier + which of the 3 unique Garage
 * perks are installed — see getCarStats() in economy.ts. Not persisted; recomputed on demand
 * from state that already is. */
export interface CarStats {
  topSpeed: number;
  acceleration: number;
  durability: number;
  handling: number;
}

export interface Part {
  id: string;
  /** Merge level, starting at 1. Two parts of the same level merge into one of level + 1, up to MAX_PART_LEVEL. */
  level: number;
  name: string;
  /** Rolled once a part reaches Max Level; unlocked permanently when installed via Anti-Stall calibration. */
  perk?: PartPerk;
}

/** Which player stat a Junkyard upgrade increases. */
export type UpgradeEffect = 'scrapPerClick' | 'scrapPerSecond' | 'maxEnergy';

export interface Upgrade {
  id: string;
  name: string;
  /** Scrap cost of the next purchase; escalates each time this upgrade is bought. */
  cost: number;
  effect: UpgradeEffect;
  /** Added to the stat named by `effect` per unit owned. */
  boost: number;
  owned: number;
}

/** One $NEON balance change, newest first — the Profile screen's History tab reads straight
 * off this log rather than trying to reconstruct it from anywhere else. */
export interface NeonTransaction {
  id: string;
  label: string;
  /** Signed: positive for a credit (win, deposit), negative for a debit (bet, withdrawal). */
  amount: number;
  timestamp: number;
}

export interface PlayerState {
  telegramFirstName?: string | null;
  telegramUsername?: string | null;

  scrap: number;
  neon: number;
  car: CarState;
  /** Which trade-in generation the current car is — starts at 1, +1 each successful trade-in. */
  carTier: number;
  /** Fixed-size 8-slot merge grid; `null` marks an empty socket. */
  inventory: (Part | null)[];
  /** How many parts have been bought via `buyPart` on the current car, driving the compound
   * cost ramp (basePrice * 1.15^partsPurchased). Starting parts don't count; resets to 0 on
   * trade-in. */
  partsPurchased: number;
  /** Energy (0-maxEnergy), spent exclusively on Garage merges. The Junkyard tap loop
   * neither consumes nor displays this. */
  energy: number;
  /** Cap for `energy`, raised permanently by the Junkyard's Expanded Battery upgrade. */
  maxEnergy: number;
  /** Unix ms timestamp of the last discrete energy-regen tick (or store creation, if none
   * have fired yet) — used to compute both the next regen and the countdown shown next to
   * the Energy bar. Distinct from `lastSaved`, which updates every tick(), not just once
   * every 5 minutes. */
  lastEnergyRegenAt: number;
  /** The Lv.4 part currently pulled out of inventory and undergoing Anti-Stall calibration on the car, if any. */
  pendingCalibrationPart: Part | null;
  /** The perks already installed on the current car via successful calibration. Once its
   * length reaches getUpgradeRequirement(carTier) the car is "MASTERED" and ready to trade
   * in; resets to empty on trade-in. Only 3 distinct perks exist, so meeting a requirement
   * above 3 means installing a repeat. */
  installedUpgrades: PartPerk[];
  /** The Junkyard's always-visible upgrade list — a straightforward, repeatable Scrap sink
   * for incremental tap/passive gains, separate from the Garage's perk system. */
  upgrades: Upgrade[];
  /** Newest-first log of $NEON balance changes, capped at NEON_HISTORY_MAX_ENTRIES — backs
   * the Profile screen's History tab. */
  neonHistory: NeonTransaction[];
  /** Guards the admin account's one-time Scrap grant (see ADMIN_SCRAP_GRANT_AMOUNT in
   * GameStore.ts) so it can only ever apply once. A dedicated flag rather than reusing
   * `neonHistory` as the dedup ledger (like the admin $NEON grant does) — that log only ever
   * represents real $NEON changes, and a Scrap grant logged there would render as "+N NEON"
   * on the Profile screen's History tab, which would be wrong. */
  hasReceivedAdminScrapGrant: boolean;
  scrapPerClick: number;
  scrapPerSecond: number;
  /** Chance (0–1) that a tap is a critical hit, awarding scrapPerClick * critMultiplier instead. */
  critChance: number;
  critMultiplier: number;
  /** Scrap awarded for time elapsed while the app was closed, shown once as a toast. Not persisted. */
  offlineEarnings: number | null;
  /** How much of the AFK/offline cap (ECONOMY.MAX_OFFLINE_SECONDS) the time away since the
   * last save had used up, as of the most recent applyOfflineProgress() run — 0 for no time
   * away, 1 (or more, pre-clamp) if the player was away long enough to hit the cap and lose
   * potential Scrap. Recomputed fresh on every load/remote-hydrate; not persisted, since a
   * stale ratio from one device showing up on another would be meaningless there. Drives the
   * Garage's AFK Storage panel warning. */
  lastOfflineCapacityRatio: number;
  /** Unix ms timestamp of the last time state was brought current — drives both the live per-second tick and the offline-progress catch-up on reload. */
  lastSaved: number;
  /** Consecutive Daily Reward claim count (1-indexed once the first claim happens) — see
   * DAILY_REWARDS in economy.ts for what each day pays out and getDailyRewardForStreak for how
   * this number maps to a tier. Resets to 0 once DAILY_REWARD_STREAK_RESET_HOURS have passed
   * since lastDailyRewardClaim without a new claim. */
  dailyRewardStreak: number;
  /** Unix ms timestamp of the last successful Daily Reward claim, or null if this save has
   * never claimed one. Drives both claim eligibility (isDailyRewardClaimable) and the streak-
   * reset check — a plain timestamp rather than a derived "claimed today" boolean so it stays
   * meaningful across app restarts and cross-device sync without needing its own reconciliation. */
  lastDailyRewardClaim: number | null;
  /** Unix ms timestamp the "Overclock: 24h Auto-Mechanic" Shop boost expires at, or null if
   * none is active. See OVERCLOCK/isOverclockActive/getBoostedScrapEarned in economy.ts — this
   * is deliberately just an expiry timestamp, not a stored rate mutation, so the boost needs no
   * explicit "undo" when it lapses.
   *
   * Deliberately no client-side action sets this. It's only ever written by
   * netlify/functions/telegram-webhook.mts, once Telegram confirms a real Stars payment
   * happened (see that file's doc comment) — the client only ever *observes* it, via the
   * existing cloud-sync pull, once the webhook's write lands. Do not add a
   * store.activateOverclockBoost()-style action that sets this directly from the client; that
   * exact pattern existed once and was removed because it let a modified client grant itself
   * the boost without ever paying. */
  boostEndsAt: number | null;
  /** Unix ms timestamp the Shop's premium "Mega Overclock (72h)" boost's own extended-AFK-cap
   * privilege expires at, or null if it's never been bought. Tracked separately from
   * `boostEndsAt` (which both the regular 24h Overclock and this Mega tier extend identically,
   * for the shared scrap multiplier) precisely because this field's only job is deciding
   * whether an offline gap gets the extended 72h AFK cap instead of the normal
   * ECONOMY.MAX_OFFLINE_SECONDS one — see getEffectiveMaxOfflineSeconds in economy.ts and
   * applyOfflineProgress in GameStore.ts. Same "never set directly from the client" rule as
   * boostEndsAt: only netlify/functions/telegram-webhook.mts writes this, once Telegram
   * confirms the Stars payment actually happened. */
  megaBoostEndsAt: number | null;
  /** Unix ms timestamp of the last "Neon Syphon" claim (The Streets' free, 24h-gated $NEON
   * trickle), or null if this save has never claimed one. See NEON_SYPHON/
   * isNeonSyphonClaimable/getNeonSyphonReward in economy.ts. */
  lastNeonSyphonTime: number | null;
  /** The connected TON wallet's user-friendly address (from @tonconnect/ui-react's
   * useTonAddress), or null if none is connected. Kept in sync from ProfileScreen.tsx, not
   * itself the source of truth for the connection (TonConnectUIProvider's own storage is) —
   * this is just a mirror so the rest of the app (the "Connect TON Wallet" Airdrop quest,
   * analytics) can read it without needing TonConnect's hooks directly. */
  walletAddress: string | null;
  /** Total races won across Auto-Drag (Race vs Player and Syndicate Bot both count) — drives
   * the "Win 10 Races" Airdrop quest. Never decremented. */
  racesWon: number;
  /** ids (see QUESTS in economy.ts) of Airdrop quests whose one-time reward has already
   * been claimed — a completed-but-unclaimed quest is still claimable exactly once; anything in
   * this array never pays out again regardless of whether its underlying condition is still
   * true. */
  claimedQuests: string[];
  /** The Night Siege bossId (see netlify/functions/night-siege.mts) whose flat
   * NIGHT_SIEGE.REWARD_NEON payout this save has already claimed, or null if none yet. Only
   * ever the *most recent* claimed boss — a fast local mirror of the server's authoritative
   * `claimedBy` list for that boss, purely so the UI can show "Claimed" instantly without a
   * round trip; the server is what actually prevents a double-claim, not this field. */
  lastClaimedBossId: string | null;
  /** Unix ms timestamp of this account's last Night Siege attack, or null if it has never
   * attacked — mirrors lastNeonSyphonTime's shape/purpose (see NIGHT_SIEGE.ATTACK_COOLDOWN_MS/
   * isBossAttackAvailable in economy.ts). A fast local mirror for the countdown UI; the
   * server's own `night-siege-attack-cooldown` record (night-siege.mts) is what actually
   * enforces the gate, same dual-track pattern as lastClaimedBossId/claimedBy above. */
  lastBossAttackTime: number | null;
  /** This account's current Syndicate id, or null if solo — mirrored from SyndicateHub.tsx
   * (see setSyndicateId in GameStore.ts) purely so the "Join or Create a Syndicate" Airdrop
   * quest (see isQuestComplete in economy.ts) has something synchronous to check. The
   * Syndicate itself (roster, name, tag, ...) is *not* duplicated here — this is only ever an
   * id pointer; SyndicateHub.tsx's own `syndicateApi.ts` backend remains the sole source of
   * truth for everything else about it. */
  syndicateId: string | null;
  /** $NEON earned from the Referral System's Tier-5 milestone (see REFERRAL in economy.ts) but
   * not yet moved into the real `neon` balance — the "manual claim" mechanic: rewards
   * accumulate here and only transfer via claimReferralRewards, triggered by the REF tab's
   * Vault "Claim Rewards" button, never automatically. */
  unclaimedNeon: number;
  /** Scrap earned the same way as unclaimedNeon above, same manual-claim mechanic. */
  unclaimedScrap: number;
  /** How many of this account's own invitees have individually reached
   * REFERRAL.MILESTONE_CAR_TIER — incremented server-side (see netlify/functions/referrals.mts's
   * milestone-reached action) whenever *this* account turns out to be the inviter on record for
   * whoever just hit the milestone. Drives the "Invite 3 Friends" Airdrop quest and the REF
   * tab's progress readout. */
  validReferralsCount: number;
  /** How many invitees have *ever* registered with this account's referral link — incremented
   * server-side (see netlify/functions/referrals.mts's handleRegister) the moment a new
   * invitee's link is established, independent of whether they ever go on to reach Tier 5.
   * `totalReferralsCount - validReferralsCount` is how the REF tab computes its "Pending"
   * indicator (invitees who joined but haven't hit the milestone yet). Never decremented. */
  totalReferralsCount: number;
  /** Whether the user has completed the initial tutorial flow. */
  hasCompletedTutorial: boolean;
  hasJoinedChannel: boolean;
}
