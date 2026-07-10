import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ProfileAvatarButton } from './components/ProfileAvatarButton';
import { useGameLoop } from './hooks/useGameLoop';
import { useTelegram } from './hooks/useTelegram';
import { useCloudSync } from './hooks/useCloudSync';
import { CurrencyBar } from './components/CurrencyBar';
import { OfflineEarningsToast } from './components/OfflineEarningsToast';
import { BottomNav, type ScreenId } from './components/BottomNav';
import { JunkyardScreen } from './screens/JunkyardScreen';
import { GarageScreen } from './screens/GarageScreen';
import { RaceScreen } from './screens/RaceScreen';
import { ProfileScreen } from './screens/ProfileScreen';

function App() {
  // Drives passive Scrap generation in the background; store stays a pure state container.
  useGameLoop();
  // Cross-device sync (Netlify Function + Blobs) — a no-op outside an actual Telegram client.
  const cloudSync = useCloudSync();
  const { isTelegram, userFirstName, userPhotoUrl } = useTelegram();
  const [activeScreen, setActiveScreen] = useState<ScreenId>('garage');
  // The Profile screen lives outside the tab system (reached via the header button, not the
  // bottom nav) — tracking it separately means returning from it lands back on whatever tab
  // was active, instead of needing its own ScreenId in the nav.
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-cyber-grid">
      <OfflineEarningsToast />
      <div className="flex-1 px-4 pb-24 pt-6">
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
          <ProfileAvatarButton photoUrl={userPhotoUrl} onClick={() => setIsProfileOpen(true)} />
          <p className="px-11 font-mono text-[9px] uppercase tracking-[0.2em] text-amber/70">
            Sys.Online // Uplink: Stable
          </p>
          <h1 className="font-display text-2xl font-bold tracking-wide text-neon-cyan drop-shadow-[0_0_4px_rgba(0,240,255,0.85)]">
            Cyber-Garage
          </h1>
          {userFirstName && (
            <p className="mt-1 font-mono text-xs text-neutral-500">
              &gt; Welcome, {userFirstName}_
            </p>
          )}
        </header>

        <CurrencyBar />

        <main className="mt-6">
          <AnimatePresence mode="wait">
            {isProfileOpen ? (
              <ProfileScreen
                key="profile"
                onBack={() => setIsProfileOpen(false)}
                syncStatus={cloudSync.status}
                onSyncNow={cloudSync.syncNow}
              />
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

      {!isProfileOpen && <BottomNav active={activeScreen} onChange={setActiveScreen} />}
    </div>
  );
}

export default App;
