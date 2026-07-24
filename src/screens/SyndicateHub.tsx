import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Radio, ShieldCheck, Users } from 'lucide-react';
import { useGameStore } from '../game/store/GameStore';
import {
  createSyndicate,
  fetchMySyndicate,
  fetchSyndicates,
  joinSyndicate,
  leaveSyndicate,
  type Syndicate,
} from '../game/mock/syndicateApi';
import { NightSiege } from './NightSiege';

const CREATE_COST_SCRAP = 1000;
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

  useEffect(() => {
    fetchMySyndicate()
      .then((syndicate) => {
        setMySyndicate(syndicate);
        setView(syndicate ? 'active' : 'menu');
      })
      .finally(() => setIsRestoringMembership(false));
  }, []);

  const handleCreated = (syndicate: Syndicate) => {
    setMySyndicate(syndicate);
    setView('active');
  };

  const handleJoined = (syndicate: Syndicate) => {
    setMySyndicate(syndicate);
    setView('active');
  };

  const handleLeft = () => {
    setMySyndicate(null);
    setView('menu');
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
        <MenuScreen onSelectCreate={() => setView('create')} onSelectJoin={() => setView('join')} />
      )}
      {view === 'create' && (
        <CreateScreen onBack={() => setView('menu')} onCreated={handleCreated} />
      )}
      {view === 'join' && <JoinScreen onBack={() => setView('menu')} onJoined={handleJoined} />}
      {view === 'active' && mySyndicate && (
        <ActiveScreen syndicate={mySyndicate} onLeft={handleLeft} />
      )}
    </div>
  );
}

interface MenuScreenProps {
  onSelectCreate: () => void;
  onSelectJoin: () => void;
}

function MenuScreen({ onSelectCreate, onSelectJoin }: MenuScreenProps) {
  return (
    <div className="flex flex-col gap-4">
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
          Cost: {CREATE_COST_SCRAP.toLocaleString()} Scrap
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

/** The charter form — a terminal-styled name/tag entry gated on the player's actual Scrap
 * balance. Scrap is deducted here (via the game store), then createSyndicate persists the
 * Syndicate itself; if that call somehow fails after the deduction (e.g. a stale "already in a
 * Syndicate" race), the Scrap is refunded rather than silently lost. */
function CreateScreen({ onBack, onCreated }: CreateScreenProps) {
  const scrap = useGameStore((state) => state.scrap);
  const spendScrap = useGameStore((state) => state.spendScrap);
  const addScrap = useGameStore((state) => state.addScrap);

  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAfford = scrap >= CREATE_COST_SCRAP;
  const isValid = name.trim().length > 0 && tag.trim().length > 0;

  const handleSubmit = async () => {
    if (!canAfford || !isValid || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    if (!spendScrap(CREATE_COST_SCRAP)) {
      setError('INSUFFICIENT SCRAP');
      setIsSubmitting(false);
      return;
    }

    try {
      const syndicate = await createSyndicate(name, tag);
      onCreated(syndicate);
    } catch (err) {
      addScrap(CREATE_COST_SCRAP);
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
          className="flex items-center gap-1 text-xs text-neutral-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
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
        <span className="font-display text-lg font-bold tabular-nums text-scrap">
          {CREATE_COST_SCRAP.toLocaleString()} Scrap
        </span>
      </div>

      {!canAfford && (
        <p className="mt-2 text-center text-xs font-bold uppercase tracking-widest text-danger-red">
          Insufficient Scrap
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

/** The server browser — every Syndicate that exists (on this device, per syndicateApi.ts's
 * localStorage scope), scrollable, each row joinable unless full. */
function JoinScreen({ onBack, onJoined }: JoinScreenProps) {
  const [syndicates, setSyndicates] = useState<Syndicate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchSyndicates()
      .then(setSyndicates)
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
          className="flex items-center gap-1 text-xs text-neutral-500"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
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
        {!isLoading && syndicates.length === 0 && (
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
}

/** The dashboard — the player's Syndicate up top, Night Siege underneath so members can attack
 * the Convoy without leaving the tab, and a deliberately understated Leave control at the very
 * bottom (this isn't an action to invite mis-taps on). */
function ActiveScreen({ syndicate, onLeft }: ActiveScreenProps) {
  const [isLeaving, setIsLeaving] = useState(false);

  const handleLeave = async () => {
    if (isLeaving) return;
    setIsLeaving(true);
    await leaveSyndicate();
    onLeft();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-neon-cyan/30 bg-white/5 p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-neon-cyan">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
              <p className="text-[10px] uppercase tracking-widest text-neutral-500">Syndicate</p>
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

      <NightSiege />

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
