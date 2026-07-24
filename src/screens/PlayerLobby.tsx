import { motion } from 'framer-motion';
import { RefreshCw, Users } from 'lucide-react';
import type { League } from '../game/config/carTiers';
import type { OpenChallenge } from '../game/mock/matchmaking';

export type LobbyView = 'browse' | 'hosting';

export interface PlayerLobbyProps {
  league: League;
  betTiers: readonly number[];
  lobbyView: LobbyView;
  openChallenges: OpenChallenge[];
  isFetching: boolean;
  acceptingMatchId: string | null;
  hostBetAmount: number;
  hostCanAfford: boolean;
  /** Win-chance math lives with the game economy, not this UI — the parent computes it per
   * opponent tier and hands back just the number to display. */
  computeWinChance: (opponentCarTier: number) => number;
  onSetHostBetAmount: (amount: number) => void;
  onStartHosting: () => void;
  onCancelHosting: () => void;
  onRefreshMatches: () => void;
  onAcceptMatch: (challenge: OpenChallenge) => void;
}

/** Race vs Player's matchmaking lobby: a "Host a Race" panel plus a scrollable list of other
 * open (mock, for now) hosted matches in the player's own League. Purely presentational — all
 * data comes from src/game/mock/matchmaking.ts via the parent, so swapping that module for a
 * real backend later shouldn't require touching this component at all. */
export function PlayerLobby({
  league,
  betTiers,
  lobbyView,
  openChallenges,
  isFetching,
  acceptingMatchId,
  hostBetAmount,
  hostCanAfford,
  computeWinChance,
  onSetHostBetAmount,
  onStartHosting,
  onCancelHosting,
  onRefreshMatches,
  onAcceptMatch,
}: PlayerLobbyProps) {
  return (
    <div className="rounded-xl border border-neon-cyan/30 bg-white/5 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-center gap-1.5 text-neon-cyan">
        <Users className="h-3.5 w-3.5" strokeWidth={2} />
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">Your League</p>
      </div>
      <p className="text-center font-display text-xl font-bold uppercase tracking-wide text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.5)]">
        {league.name}
      </p>
      <p className="text-center text-[10px] text-neutral-600">
        Tier {league.minTier}
        {Number.isFinite(league.maxTier) ? `–${league.maxTier}` : '+'} only
      </p>

      {lobbyView === 'hosting' ? (
        <div className="mt-4 flex flex-col items-center gap-3 py-8">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent shadow-[0_0_16px_rgba(0,240,255,0.5)]" />
          <p className="font-display text-sm font-bold uppercase tracking-wide text-neon-cyan">
            Waiting for Opponent...
          </p>
          <p className="text-xs text-neutral-500">
            {hostBetAmount} NEON hosted in {league.name}
          </p>
          <button
            type="button"
            onClick={onCancelHosting}
            className="mt-2 rounded-lg border border-neutral-700 px-4 py-2 text-xs uppercase tracking-wide text-neutral-400"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-lg border border-neutral-800 bg-black/20 p-3">
            <p className="text-xs uppercase tracking-widest text-neutral-400">Host a Race</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {betTiers.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onSetHostBetAmount(tier)}
                  className={`rounded-lg border py-2.5 font-display text-sm font-bold tabular-nums transition-colors ${
                    hostBetAmount === tier
                      ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan shadow-[0_0_16px_rgba(0,240,255,0.35)]'
                      : 'border-neutral-700 bg-black/20 text-neutral-400'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
            <motion.button
              type="button"
              onClick={onStartHosting}
              disabled={!hostCanAfford}
              whileHover={hostCanAfford ? { scale: 1.03 } : undefined}
              whileTap={hostCanAfford ? { scale: 0.97 } : undefined}
              className="mt-3 w-full rounded-lg border border-neon-cyan/50 bg-neon-cyan/10 py-2.5 text-sm font-bold uppercase tracking-wide text-neon-cyan transition-colors disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600"
            >
              Host a Race
            </motion.button>
            {!hostCanAfford && (
              <p className="mt-2 text-center text-xs text-red-400">Not enough NEON</p>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-widest text-neutral-400">
                Open Challenges
              </p>
              <button type="button" onClick={onRefreshMatches} aria-label="Refresh challenges">
                <RefreshCw
                  className={`h-3.5 w-3.5 text-neutral-500 ${isFetching ? 'animate-spin' : ''}`}
                  strokeWidth={2}
                />
              </button>
            </div>

            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
              {isFetching && openChallenges.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-neon-magenta border-t-transparent shadow-[0_0_12px_rgba(255,46,230,0.5)]" />
                  <p className="text-center text-xs text-neutral-600">
                    Scanning the {league.name}...
                  </p>
                </div>
              )}
              {!isFetching && openChallenges.length === 0 && (
                <p className="py-6 text-center text-xs text-neutral-600">
                  No racers in your league right now. Host a race!
                </p>
              )}
              {openChallenges.map((challenge) => (
                <MatchCard
                  key={challenge.id}
                  challenge={challenge}
                  winChance={computeWinChance(challenge.opponentCarTier)}
                  isAccepting={acceptingMatchId === challenge.id}
                  disabled={acceptingMatchId !== null}
                  onAccept={() => onAcceptMatch(challenge)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface MatchCardProps {
  challenge: OpenChallenge;
  winChance: number;
  isAccepting: boolean;
  disabled: boolean;
  onAccept: () => void;
}

/** One row of the "underground manifest" — an opponent's name, car tier, an honest per-match
 * win-chance estimate, their bet, and an Accept button. */
function MatchCard({ challenge, winChance, isAccepting, disabled, onAccept }: MatchCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-neon-magenta/25 bg-black/30 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neon-magenta/50 bg-neon-magenta/10 font-display text-sm font-bold text-neon-magenta">
        {challenge.opponentName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-xs font-bold uppercase tracking-wide text-neutral-100">
          {challenge.opponentName}
        </p>
        <p className="text-[10px] text-neutral-500">
          Tier {challenge.opponentCarTier} · Est. {winChance}% Win
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-display text-sm font-bold tabular-nums text-neon-magenta">
          {challenge.betAmount} NEON
        </span>
        <motion.button
          type="button"
          onClick={onAccept}
          disabled={disabled}
          whileHover={!disabled ? { scale: 1.05 } : undefined}
          whileTap={!disabled ? { scale: 0.95 } : undefined}
          className="rounded border border-neon-cyan/50 bg-neon-cyan/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neon-cyan transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isAccepting ? '...' : 'Accept Match'}
        </motion.button>
      </div>
    </div>
  );
}
