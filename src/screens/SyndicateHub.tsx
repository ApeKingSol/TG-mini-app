import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  Crown, Info,
  Loader2,
  Radio,
  ShieldCheck,
  Star,
  Swords,
  Users,
} from 'lucide-react';
import { useGameStore, getTelegramUserId } from '../game/store/GameStore';
import {
  createSyndicate,
  demoteMember,
  fetchMySyndicate,
  fetchSyndicates,
  joinSyndicate,
  kickMember,
  leaveSyndicate,
  promoteMember,
  type Syndicate,
} from '../game/mock/syndicateApi';
import { NightSiege } from './NightSiege';

const CREATE_COST_NEON = 1000;
const NAME_MAX_LENGTH = 20;
const TAG_MAX_LENGTH = 4;

type SyndicateView = 'menu' | 'create' | 'join' | 'active';

/** The gate between solo play and clan play. `view` drives which screen shows; `mySyndicate`
 * is real, persisted state (see syndicateApi.ts — localStorage-backed, not component state that
 * forgets on reload), so the first thing this does on mount is ask "does this player already
 * belong to one?" and jump straight to the dashboard if so, rather than always starting cold at
 * the menu. */
export function SyndicateHub() {
  const [view, setView] = useState<SyndicateView>('menu');
  const [mySyndicate, setMySyndicate] = useState<Syndicate | null>(null);
  const [isRestoringMembership, setIsRestoringMembership] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const setSyndicateId = useGameStore((state) => state.setSyndicateId);

  useEffect(() => {
    fetchMySyndicate()
      .then((syndicate) => {
        setMySyndicate(syndicate);
        setView(syndicate ? 'active' : 'menu');
        // Mirrors whatever this restore check found (including "solo," a real null) into
        // GameStore so the "Join or Create a Syndicate" Airdrop quest has an answer the very
        // first time this screen ever loads, not just after a create/join/leave this session.
        setSyndicateId(syndicate ? syndicate.id : null);
      })
      .catch((err: unknown) => {
        // Previously silent (no .catch at all) — a failed check here landed on the exact same
        // "No Syndicate Detected" menu a genuinely-solo player sees, which is indistinguishable
        // from a real member being wrongly told they have no Syndicate because the backend
        // request never actually succeeded (e.g. a misconfigured TELEGRAM_BOT_TOKEN making
        // every authenticated call 401).
        setRestoreError(err instanceof Error ? err.message.toUpperCase() : 'COULD NOT REACH SERVER');
      })
      .finally(() => setIsRestoringMembership(false));
    // setSyndicateId is a Zustand action reference — stable across renders, so including it
    // here doesn't change how often this effect actually runs.
  }, [setSyndicateId]);

  const handleCreated = (syndicate: Syndicate) => {
    setMySyndicate(syndicate);
    setView('active');
    setSyndicateId(syndicate.id);
  };

  const handleJoined = (syndicate: Syndicate) => {
    setMySyndicate(syndicate);
    setView('active');
    setSyndicateId(syndicate.id);
  };

  const handleLeft = () => {
    setMySyndicate(null);
    setView('menu');
    setSyndicateId(null);
  };

  const handleSyndicateUpdate = (syndicate: Syndicate) => {
    setMySyndicate(syndicate);
  };

  if (isRestoringMembership) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber" strokeWidth={2} />
        <p className="text-xs uppercase tracking-widest text-neutral-600">
          Checking Syndicate roster...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {view === 'menu' && (
        <MenuScreen
          onSelectCreate={() => setView('create')}
          onSelectJoin={() => setView('join')}
          loadError={restoreError}
        />
      )}
      {view === 'create' && (
        <CreateScreen onBack={() => setView('menu')} onCreated={handleCreated} />
      )}
      {view === 'join' && <JoinScreen onBack={() => setView('menu')} onJoined={handleJoined} />}
      {view === 'active' && mySyndicate && (
        <ActiveScreen
          syndicate={mySyndicate}
          onLeft={handleLeft}
          onSyndicateUpdate={handleSyndicateUpdate}
        />
      )}
    </div>
  );
}

interface MenuScreenProps {
  onSelectCreate: () => void;
  onSelectJoin: () => void;
  /** Set when the initial "does this player already have a Syndicate" check failed outright —
   * shown above the panel below rather than replacing it, since "No Syndicate Detected" might
   * still be accurate; this just makes clear the answer wasn't actually confirmed. */
  loadError: string | null;
}

function MenuScreen({ onSelectCreate, onSelectJoin, loadError }: MenuScreenProps) {
  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <div className="rounded-xl border border-danger-red/40 bg-danger-red/10 p-3 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-danger-red">
            {loadError}
          </p>
          <p className="mt-1 text-[10px] text-danger-red/70">
            Could not confirm your Syndicate membership — the panel below may be wrong.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-amber/30 bg-white/5 p-5 text-center backdrop-blur-xl">
        <Users className="mx-auto h-8 w-8 text-amber" strokeWidth={1.5} />
        <p className="mt-2 font-display text-lg font-bold uppercase tracking-wide text-amber">
          No Syndicate Detected
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Solo runners can't take down a World Boss alone. Charter or join a Syndicate to raid
          Corporate Convoys together in Night Siege.
        </p>
      </div>

      <motion.button
        type="button"
        onClick={onSelectCreate}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex flex-col items-center gap-1 rounded-xl border-2 border-amber bg-amber/10 py-4 shadow-[0_0_24px_rgba(255,149,0,0.3)]"
      >
        <span className="font-display text-base font-black uppercase tracking-widest text-amber">
          Create Syndicate
        </span>
        <span className="text-[10px] uppercase tracking-widest text-amber/70">
          Cost: {CREATE_COST_NEON.toLocaleString()} NEON
        </span>
      </motion.button>

      <motion.button
        type="button"
        onClick={onSelectJoin}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex flex-col items-center gap-1 rounded-xl border-2 border-neon-cyan bg-neon-cyan/10 py-4 shadow-[0_0_24px_rgba(0,240,255,0.3)]"
      >
        <span className="font-display text-base font-black uppercase tracking-widest text-neon-cyan">
          Join Syndicate
        </span>
        <span className="text-[10px] uppercase tracking-widest text-neon-cyan/70">
          Browse Active Rosters
        </span>
      </motion.button>
    </div>
  );
}

interface CreateScreenProps {
  onBack: () => void;
  onCreated: (syndicate: Syndicate) => void;
}

/** The charter form — a terminal-styled name/tag entry gated on the player's actual $NEON
 * balance. $NEON is deducted here (via the game store), then createSyndicate persists the
 * Syndicate itself; if that call somehow fails after the deduction (e.g. a stale "already in a
 * Syndicate" race), the $NEON is refunded rather than silently lost. */
function CreateScreen({ onBack, onCreated }: CreateScreenProps) {
  const neon = useGameStore((state) => state.neon);
  const spendNeon = useGameStore((state) => state.spendNeon);
  const addNeon = useGameStore((state) => state.addNeon);

  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAfford = neon >= CREATE_COST_NEON;
  const isValid = name.trim().length > 0 && tag.trim().length > 0;

  const handleSubmit = async () => {
    if (!canAfford || !isValid || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    if (!spendNeon(CREATE_COST_NEON, 'Syndicate Charter')) {
      setError(`INSUFFICIENT NEON (${CREATE_COST_NEON} REQUIRED)`);
      setIsSubmitting(false);
      return;
    }

    try {
      const syndicate = await createSyndicate(name, tag);
      onCreated(syndicate);
    } catch (err) {
      addNeon(CREATE_COST_NEON, 'Syndicate Charter Refund');
      setError(err instanceof Error ? err.message.toUpperCase() : 'CHARTER FAILED');
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-neon-cyan/30 bg-white/5 p-5 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-bold text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Back
        </button>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-neon-cyan">
          Charter New Syndicate
        </p>
        <span className="w-10" />
      </div>

      <label className="mt-4 block text-[10px] uppercase tracking-widest text-neutral-500">
        Syndicate Name
      </label>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value.slice(0, NAME_MAX_LENGTH))}
        placeholder="e.g. Chrome Vipers"
        className="mt-1 w-full rounded-lg border border-neutral-700 bg-black/40 px-3 py-2.5 font-mono text-sm text-neon-cyan placeholder:text-neutral-600 focus:border-neon-cyan focus:outline-none"
      />
      <p className="mt-1 text-right text-[10px] tabular-nums text-neutral-600">
        {name.length}/{NAME_MAX_LENGTH}
      </p>

      <label className="mt-3 block text-[10px] uppercase tracking-widest text-neutral-500">
        Clan Tag
      </label>
      <input
        type="text"
        value={tag}
        onChange={(event) => setTag(event.target.value.toUpperCase().slice(0, TAG_MAX_LENGTH))}
        placeholder="e.g. CVPR"
        className="mt-1 w-full rounded-lg border border-neutral-700 bg-black/40 px-3 py-2.5 font-mono text-lg font-bold uppercase tracking-[0.3em] text-neon-magenta placeholder:text-neutral-600 focus:border-neon-magenta focus:outline-none"
      />
      <p className="mt-1 text-right text-[10px] tabular-nums text-neutral-600">
        {tag.length}/{TAG_MAX_LENGTH}
      </p>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-neutral-800 bg-black/20 p-3">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">
          Charter Cost
        </span>
        <span className="font-display text-lg font-bold tabular-nums text-neon-magenta">
          {CREATE_COST_NEON.toLocaleString()} NEON
        </span>
      </div>

      {!canAfford && (
        <p className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-danger-red">
          Insufficient NEON
        </p>
      )}
      {error && (
        <p className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-danger-red">
          {error}
        </p>
      )}

      <motion.button
        type="button"
        onClick={handleSubmit}
        disabled={!canAfford || !isValid || isSubmitting}
        whileHover={canAfford && isValid && !isSubmitting ? { scale: 1.02 } : undefined}
        whileTap={canAfford && isValid && !isSubmitting ? { scale: 0.97 } : undefined}
        className="mt-4 w-full rounded-lg border border-neon-cyan/50 bg-neon-cyan/10 py-3 font-display text-sm font-bold uppercase tracking-wide text-neon-cyan transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? 'Filing Charter...' : 'Charter Syndicate'}
      </motion.button>
    </motion.div>
  );
}

interface JoinScreenProps {
  onBack: () => void;
  onJoined: (syndicate: Syndicate) => void;
}

/** The server browser — every Syndicate that exists, scrollable, each row joinable unless full. */
function JoinScreen({ onBack, onJoined }: JoinScreenProps) {
  const [syndicates, setSyndicates] = useState<Syndicate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchSyndicates()
      .then(setSyndicates)
      .catch((err: unknown) => {
        // Previously silent (no .catch at all) — a failed fetch left `syndicates` at its
        // initial `[]`, which renders identically to "the server browser is genuinely empty"
        // below even when the real cause is a broken/misconfigured backend (e.g. a missing
        // TELEGRAM_BOT_TOKEN making every authenticated call 401 instead of returning a list).
        setError(err instanceof Error ? err.message.toUpperCase() : 'COULD NOT REACH SERVER');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleJoin = async (syndicate: Syndicate) => {
    if (joiningId) return;
    setError(null);
    setJoiningId(syndicate.id);
    try {
      const joined = await joinSyndicate(syndicate.id);
      onJoined(joined);
    } catch (err) {
      setError(err instanceof Error ? err.message.toUpperCase() : 'JOIN FAILED');
      setJoiningId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-neon-cyan/30 bg-white/5 p-4 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-bold text-neutral-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Back
        </button>
        <div className="flex items-center gap-1.5 text-neon-cyan">
          <Radio className="h-3.5 w-3.5" strokeWidth={2} />
          <p className="font-display text-sm font-bold uppercase tracking-wide">
            Server Browser
          </p>
        </div>
        <span className="w-10" />
      </div>

      {error && (
        <p className="mt-3 text-center text-xs font-bold uppercase tracking-widest text-danger-red">
          {error}
        </p>
      )}

      <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
        {isLoading && (
          <p className="py-8 text-center text-xs text-neutral-600">Scanning the network...</p>
        )}
        {!isLoading && !error && syndicates.length === 0 && (
          <p className="py-8 text-center text-xs text-neutral-600">
            No Syndicates found. Be the first to charter one.
          </p>
        )}
        {syndicates.map((syndicate) => (
          <SyndicateRow
            key={syndicate.id}
            syndicate={syndicate}
            isJoining={joiningId === syndicate.id}
            disabled={joiningId !== null}
            onJoin={() => handleJoin(syndicate)}
          />
        ))}
      </div>
    </motion.div>
  );
}

interface SyndicateRowProps {
  syndicate: Syndicate;
  isJoining: boolean;
  disabled: boolean;
  onJoin: () => void;
}

function SyndicateRow({ syndicate, isJoining, disabled, onJoin }: SyndicateRowProps) {
  const isFull = syndicate.membersCount >= syndicate.maxMembers;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-neon-magenta/25 bg-black/30 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neon-magenta/50 bg-neon-magenta/10 font-display text-[10px] font-bold text-neon-magenta">
        {syndicate.tag}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-xs font-bold uppercase tracking-wide text-neutral-100">
          [{syndicate.tag}] {syndicate.name}
        </p>
        <p className="text-[10px] text-neutral-500">
          Members: {syndicate.membersCount}/{syndicate.maxMembers}
        </p>
      </div>
      <motion.button
        type="button"
        onClick={onJoin}
        disabled={disabled || isFull}
        whileHover={!disabled && !isFull ? { scale: 1.05 } : undefined}
        whileTap={!disabled && !isFull ? { scale: 0.95 } : undefined}
        className="shrink-0 rounded border border-neon-cyan/50 bg-neon-cyan/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neon-cyan transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isFull ? 'Full' : isJoining ? '...' : 'Join'}
      </motion.button>
    </div>
  );
}

interface ActiveScreenProps {
  syndicate: Syndicate;
  onLeft: () => void;
  onSyndicateUpdate: (syndicate: Syndicate) => void;
}

import { type SyndicateRole } from '../game/config/economy';

type MyRole = SyndicateRole;

/** The dashboard — the player's Syndicate up top, the collapsible member roster (with role-gated
 * Promote/Demote/Kick and each member's damage to the current boss), Night Siege underneath so
 * members can attack the Convoy without leaving the tab, and a deliberately understated Leave
 * control at the very bottom (this isn't an action to invite mis-taps on). */
function ActiveScreen({ syndicate, onLeft, onSyndicateUpdate }: ActiveScreenProps) {
  const [isEarningsInfoOpen, setIsEarningsInfoOpen] = useState(false);
  const myId = getTelegramUserId();
  const [isLeaving, setIsLeaving] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Fed by NightSiege.tsx's own onDamageLogUpdate callback (it already polls the shared boss
  // status every 5s for its own HP bar) rather than this component running a second, redundant
  // poller against the same endpoint — fewer concurrent requests against the same boss record
  // means less chance of the exact kind of read/write race that made the expiry countdown
  // misbehave before.
  const [damageLog, setDamageLog] = useState<Record<string, number>>({});

  // `?? []` guards against a Syndicate created before Co-Leader roles existed — the backend
  // now backfills coLeaderIds itself too (see normalizeSyndicateRecord in syndicates.mts), but
  // this render should never trust a network response's shape unconditionally either.
  const myRole: MyRole =
    myId !== null && String(myId) === String(syndicate.leaderId)
      ? 'leader'
      : myId !== null && (syndicate.coLeaderIds ?? []).map(String).includes(String(myId))
        ? 'co-leader'
        : 'member';

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    await leaveSyndicate();
    onLeft();
  };

  const handlePromote = async (targetUserId: string) => {
    if (actioningId) return;
    setActionError(null);
    setActioningId(targetUserId);
    try {
      const updated = await promoteMember(targetUserId);
      onSyndicateUpdate(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message.toUpperCase() : 'PROMOTE FAILED');
    } finally {
      setActioningId(null);
    }
  };

  const handleDemote = async (targetUserId: string) => {
    if (actioningId) return;
    setActionError(null);
    setActioningId(targetUserId);
    try {
      const updated = await demoteMember(targetUserId);
      onSyndicateUpdate(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message.toUpperCase() : 'DEMOTE FAILED');
    } finally {
      setActioningId(null);
    }
  };

  const handleKick = async (targetUserId: string) => {
    if (actioningId) return;
    setActionError(null);
    setActioningId(targetUserId);
    try {
      const updated = await kickMember(targetUserId);
      if (updated) {
        onSyndicateUpdate(updated);
      } else {
        // Not reachable in practice (kicking someone else can never empty a Syndicate — the
        // kicker themselves always remains a member), but handled for completeness.
        onLeft();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message.toUpperCase() : 'KICK FAILED');
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence>
        {isEarningsInfoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl border border-neon-cyan/50 bg-cyber-dark p-6 shadow-[0_0_30px_rgba(0,240,255,0.15)]"
            >
              <h3 className="font-display text-lg font-bold uppercase tracking-widest text-neon-cyan mb-4 flex items-center gap-2">
                <Info className="h-5 w-5" />
                Night Siege Rewards
              </h3>
              <div className="space-y-4 text-sm text-neutral-300">
                <p>When a Syndicate defeats the Night Siege Boss, members receive a $NEON bounty based on their role:</p>
                <ul className="space-y-2">
                  <li className="flex items-center justify-between rounded border border-amber/30 bg-amber/5 px-3 py-2">
                    <span className="font-bold text-amber">Leader</span>
                    <span className="font-mono text-amber">250 NEON</span>
                  </li>
                  <li className="flex items-center justify-between rounded border border-neon-cyan/30 bg-neon-cyan/5 px-3 py-2">
                    <span className="font-bold text-neon-cyan">Co-Leaders</span>
                    <span className="font-mono text-neon-cyan">150 NEON</span>
                  </li>
                  <li className="flex items-center justify-between rounded border border-neutral-700 bg-white/5 px-3 py-2">
                    <span className="font-bold text-neutral-300">Members</span>
                    <span className="font-mono text-neutral-400">75 NEON</span>
                  </li>
                </ul>
              </div>
              <button
                onClick={() => setIsEarningsInfoOpen(false)}
                className="mt-6 w-full rounded-lg bg-neon-cyan py-3 font-mono text-sm font-bold uppercase tracking-widest text-black"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="rounded-2xl border border-neon-cyan/30 bg-white/5 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-neon-cyan">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">Syndicate</p>
              <button onClick={() => setIsEarningsInfoOpen(true)} className="ml-1 rounded-full bg-neon-cyan/20 p-0.5 text-neon-cyan hover:bg-neon-cyan/40">
                <Info className="h-3 w-3" />
              </button>
            </div>
            <p className="truncate font-display text-lg font-bold uppercase tracking-wide text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]">
              [{syndicate.tag}] {syndicate.name}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Members</p>
            <p className="font-display text-lg font-bold tabular-nums text-neon-cyan">
              {syndicate.membersCount}/{syndicate.maxMembers}
            </p>
          </div>
        </div>
      </div>

      <MemberRosterCard
        syndicate={syndicate}
        myId={myId}
        myRole={myRole}
        actioningId={actioningId}
        damageLog={damageLog}
        onPromote={handlePromote}
        onDemote={handleDemote}
        onKick={handleKick}
      />
      {actionError && (
        <p className="text-center text-xs font-bold uppercase tracking-widest text-danger-red">
          {actionError}
        </p>
      )}

      <NightSiege syndicateId={syndicate.id} myRole={myRole} onDamageLogUpdate={setDamageLog} />

      <button
        type="button"
        onClick={handleLeave}
        disabled={isLeaving}
        className="self-center text-[10px] uppercase tracking-widest text-neutral-600 underline decoration-dotted underline-offset-2 disabled:opacity-50"
      >
        {isLeaving ? 'Leaving...' : 'Leave Syndicate'}
      </button>
    </div>
  );
}

interface MemberRosterCardProps {
  syndicate: Syndicate;
  myId: string | null;
  myRole: MyRole;
  /** The member id currently mid-Promote/Demote/Kick, or null — disables every row's action
   * buttons while set, so a slow request can't be double-fired by a second tap. */
  actioningId: string | null;
  /** userId -> total damage dealt to the CURRENT Night Siege boss (see
   * netlify/functions/night-siege.mts's damageLog) — rendered next to each member's name. */
  damageLog: Record<string, number>;
  onPromote: (targetUserId: string) => void;
  onDemote: (targetUserId: string) => void;
  onKick: (targetUserId: string) => void;
}

/** The named roster — collapsed by default (a full member list has no business permanently
 * eating screen space above Night Siege, the thing players actually came here to do), each row
 * showing a role badge, this raid's damage dealt, and (role-gated, per
 * netlify/functions/syndicates.mts's exact permission rules) Promote/Demote/Kick buttons. The
 * Leader can promote a regular member to Co-Leader, demote a Co-Leader back down, or kick anyone
 * but themselves; a Co-Leader can only kick a regular member (never the Leader, never another
 * Co-Leader, and never promote/demote anyone); a regular member sees badges and damage only, no
 * action buttons at all. */
function MemberRosterCard({
  syndicate,
  myId,
  myRole,
  actioningId,
  damageLog,
  onPromote,
  onDemote,
  onKick,
}: MemberRosterCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-white/5 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between p-4"
      >
        <div className="flex items-center gap-1.5 text-neutral-400">
          <Users className="h-3.5 w-3.5" strokeWidth={2} />
          <p className="font-display text-xs font-bold uppercase tracking-wide">
            Roster ({syndicate.membersCount})
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-neutral-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 px-4 pb-4">
              {/* `?? []`/`?? {}` guard against a Syndicate created before named rosters existed,
                 or a boss whose damageLog hasn't been fetched yet — this render must never
                 crash regardless of what shape a legacy record or an in-flight fetch hands it. */}
              {(syndicate.members ?? []).map((member) => {
                const isSelf = String(member.id) === String(myId);
                const canPromote =
                  myRole === 'leader' && !isSelf && !member.isLeader && !member.isCoLeader;
                const canDemote = myRole === 'leader' && !isSelf && member.isCoLeader;
                const canKick =
                  !isSelf &&
                  !member.isLeader &&
                  (myRole === 'leader' || (myRole === 'co-leader' && !member.isCoLeader));
                const isBusy = actioningId === member.id;
                const damage = (damageLog ?? {})[member.id] ?? 0;

                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-black/20 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-neutral-200">
                        {member.name}
                        {isSelf ? ' (You)' : ''}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {(member.isLeader || member.isCoLeader) && (
                          <div
                            className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${
                              member.isLeader ? 'text-amber' : 'text-neon-cyan'
                            }`}
                          >
                            {member.isLeader ? (
                              <Crown className="h-2.5 w-2.5" strokeWidth={2.5} />
                            ) : (
                              <Star className="h-2.5 w-2.5" strokeWidth={2.5} />
                            )}
                            {member.isLeader ? 'Leader' : 'Co-Leader'}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-danger-red/80">
                          <Swords className="h-2.5 w-2.5" strokeWidth={2.5} />
                          {damage.toLocaleString()} dmg
                        </div>
                      </div>
                    </div>
                    {canPromote && (
                      <button
                        type="button"
                        onClick={() => onPromote(member.id)}
                        disabled={isBusy}
                        className="shrink-0 rounded border border-neon-cyan/50 bg-neon-cyan/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-neon-cyan transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isBusy ? '...' : 'Promote'}
                      </button>
                    )}
                    {canDemote && (
                      <button
                        type="button"
                        onClick={() => onDemote(member.id)}
                        disabled={isBusy}
                        className="shrink-0 rounded border border-amber/50 bg-amber/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-amber transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isBusy ? '...' : 'Demote'}
                      </button>
                    )}
                    {canKick && (
                      <button
                        type="button"
                        onClick={() => onKick(member.id)}
                        disabled={isBusy}
                        className="shrink-0 rounded border border-danger-red/50 bg-danger-red/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-danger-red transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {isBusy ? '...' : 'Kick'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
