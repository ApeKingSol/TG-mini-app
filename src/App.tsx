import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ProfileAvatarButton } from './components/ProfileAvatarButton';
import { AirdropEntryButton } from './components/AirdropEntryButton';
import { ReferralsEntryButton } from './components/ReferralsEntryButton';
import { ScreenBackground } from './components/ScreenBackground';
import { useGameLoop } from './hooks/useGameLoop';
import { useTelegram } from './hooks/useTelegram';
import { useCloudSync } from './hooks/useCloudSync';
import { CurrencyBar } from './components/CurrencyBar';
import { OfflineEarningsToast } from './components/OfflineEarningsToast';
import { OnboardingModal } from './components/OnboardingModal';
import { BottomNav, type ScreenId } from './components/BottomNav';
import { JunkyardScreen } from './screens/JunkyardScreen';
import { GarageScreen } from './screens/GarageScreen';
import { RaceScreen } from './screens/RaceScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AirdropScreen } from './screens/AirdropScreen';
import { ReferralsScreen } from './screens/ReferralsScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { trackAppOpened } from './utils/analytics';
import { useGameStore } from './game/store/GameStore';

function App() {
  // Drives passive Scrap generation in the background; store stays a pure state container.
  useGameLoop();
  // Cross-device sync (Netlify Function + Blobs) — a no-op outside an actual Telegram client.
  const cloudSync = useCloudSync();
  const { isTelegram, userFirstName, userPhotoUrl } = useTelegram();
  const [activeScreen, setActiveScreen] = useState<ScreenId>('garage');
  const hasCompletedTutorial = useGameStore((state) => state.hasCompletedTutorial);
  const completeTutorial = useGameStore((state) => state.completeTutorial);
  const [forceTutorialOpen, setForceTutorialOpen] = useState(false);
  // The Profile and Airdrop screens both live outside the tab system (reached via header
  // buttons, not the bottom nav) — tracking them as one mutually-exclusive value (rather than
  // two independent isProfileOpen/isAirdropOpen booleans, which this used to be) means returning
  // from either lands back on whatever tab was active, instead of needing their own ScreenId in
  // the nav, *and* makes "both open at once" structurally impossible. Two independent booleans
  // let exactly that happen: opening Airdrop from inside Profile only ever set isAirdropOpen to
  // true while isProfileOpen stayed true, and the render ternary checked isProfileOpen first —
  // so the Airdrop button silently did nothing whenever Profile was already open, the exact bug
  // this replaced.
  const [activeOverlay, setActiveOverlay] = useState<'profile' | 'airdrop' | 'referrals' | 'leaderboard' | null>(
    null,
  );

  useEffect(() => {
    trackAppOpened();
    
    const handleOpenLeaderboard = () => setActiveOverlay('leaderboard');
    window.addEventListener('openLeaderboard', handleOpenLeaderboard);
    return () => window.removeEventListener('openLeaderboard', handleOpenLeaderboard);
  }, []);

  const handleTutorialComplete = () => {
    completeTutorial();
    setForceTutorialOpen(false);
  };

  // First-Launch Race Condition fix: nothing below this point may render while
  // cloudSync.status.isInitialized is still false — Header, BottomNav, and every screen are
  // exactly what could otherwise fire a Stars purchase, a matchmaking call, or a Syndicate
  // action before this account's cloud state has been checked even once, which is what made a
  // completely new account's very first launch fail at all three while a reload (landing after
  // that first check had already settled) worked fine. useGameLoop/useCloudSync/useTelegram
  // themselves still have to run unconditionally above this, per the rules of hooks — only the
  // JSX they'd otherwise feed is held back.
  if (!cloudSync.status.isInitialized) {
    return <UplinkingScreen />;
  }

  return (
    <>
      <div className="flex min-h-screen flex-col bg-cyber-grid">
        <ScreenBackground activeScreen={activeScreen} />
      <OfflineEarningsToast />
      <div className="flex-1 px-4 pb-[120px] pt-6">
        {!isTelegram && (
          <div className="panel-cut-sm mb-4 border border-amber/40 bg-amber/[0.06] px-3 py-2 font-mono text-[11px] uppercase tracking-wide text-amber">
            [!] Running outside Telegram — open via a bot link for the full uplink
          </div>
        )}

        <header className="relative mb-6 text-center">
          {/* Explicit z-index, not just DOM order: the h1 below has a `drop-shadow` filter,
             and per the CSS filter-effects spec any element with a filter is treated as if
             `position: relative` for stacking purposes — that silently promoted it into the
             same "positioned, z-index:auto" paint layer as this absolutely-positioned button,
             and being later in the DOM it painted on top, swallowing every tap even though
             the button itself was never broken. A real (non-auto) z-index wins regardless of
             DOM order or sibling filters. */}
          <AirdropEntryButton onClick={() => setActiveOverlay('airdrop')} />
          <ProfileAvatarButton photoUrl={userPhotoUrl} onClick={() => setActiveOverlay('profile')} />
          <h1 className="font-display text-2xl font-bold tracking-wide text-neon-cyan drop-shadow-[0_0_4px_rgba(0,240,255,0.85)]">
            Cyber-Garage
          </h1>
          {userFirstName && (
            <p className="mt-1 font-mono text-xs text-neutral-500">
              &gt; Welcome, {userFirstName}_
            </p>
          )}
        </header>

        <ReferralsEntryButton onClick={() => setActiveOverlay('referrals')} />

        <CurrencyBar />

        <main className="mt-6">
          <AnimatePresence mode="wait">
            {activeOverlay === 'profile' ? (
              <ProfileScreen key="profile" onBack={() => setActiveOverlay(null)} onReplayTutorial={() => { setActiveOverlay(null); setForceTutorialOpen(true); }} />
            ) : activeOverlay === 'airdrop' ? (
              <AirdropScreen key="airdrop" onBack={() => setActiveOverlay(null)} />
            ) : activeOverlay === 'referrals' ? (
              <ReferralsScreen key="referrals" onBack={() => setActiveOverlay(null)} />
            ) : activeOverlay === 'leaderboard' ? (
              <LeaderboardScreen key="leaderboard" onBack={() => setActiveOverlay(null)} />
            ) : (
              <>
                {activeScreen === 'junkyard' && <JunkyardScreen key="junkyard" />}
                {activeScreen === 'garage' && <GarageScreen key="garage" />}
                {activeScreen === 'race' && <RaceScreen key="race" />}
              </>
            )}
          </AnimatePresence>
        </main>
      </div>

      {activeOverlay === null && (
        <BottomNav active={activeScreen} onChange={setActiveScreen} />
      )}

      </div>
      {(!hasCompletedTutorial || forceTutorialOpen) && <OnboardingModal onComplete={handleTutorialComplete} />}
    </>
  );
}

/** Shown in place of the entire app — no Header, no BottomNav, no screens — until
 * useCloudSync's very first pull attempt has settled (or immediately outside Telegram, where
 * there's nothing to sync). See App()'s isInitialized check above for why this exists: it's the
 * whole fix for the first-launch race where a brand-new account's earliest taps could fire an
 * authenticated API call before the app had confirmed anything about this account's cloud
 * state. */
function UplinkingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cyber-grid px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-neon-cyan border-t-transparent shadow-[0_0_20px_rgba(0,240,255,0.5)]" />
      <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
        Uplinking...
      </p>
      <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
        Syncing with the Grid
      </p>
    </div>
  );
}

export default App;
