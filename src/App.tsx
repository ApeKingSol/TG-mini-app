import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useGameLoop } from './hooks/useGameLoop';
import { useTelegram } from './hooks/useTelegram';
import { CurrencyBar } from './components/CurrencyBar';
import { OfflineEarningsToast } from './components/OfflineEarningsToast';
import { BottomNav, type ScreenId } from './components/BottomNav';
import { JunkyardScreen } from './screens/JunkyardScreen';
import { GarageScreen } from './screens/GarageScreen';
import { RaceScreen } from './screens/RaceScreen';

function App() {
  // Drives passive Scrap generation in the background; store stays a pure state container.
  useGameLoop();
  const { isTelegram, userFirstName } = useTelegram();
  const [activeScreen, setActiveScreen] = useState<ScreenId>('garage');

  return (
    <div className="flex min-h-screen flex-col bg-cyber-grid">
      <OfflineEarningsToast />
      <div className="flex-1 px-4 pb-24 pt-6">
        {!isTelegram && (
          <div className="mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
            Running outside Telegram — open via a Telegram bot link to test
            the full experience.
          </div>
        )}

        <header className="mb-6 text-center">
          <h1 className="font-display text-2xl font-bold tracking-wide text-neon-cyan drop-shadow-[0_0_10px_rgba(0,240,255,0.65)]">
            Cyber-Garage: Syndicate Mechanics
          </h1>
          {userFirstName && (
            <p className="mt-1 text-sm text-neutral-400">
              Welcome, {userFirstName}
            </p>
          )}
        </header>

        <CurrencyBar />

        <main className="mt-6">
          <AnimatePresence mode="wait">
            {activeScreen === 'junkyard' && <JunkyardScreen key="junkyard" />}
            {activeScreen === 'garage' && <GarageScreen key="garage" />}
            {activeScreen === 'race' && <RaceScreen key="race" />}
          </AnimatePresence>
        </main>
      </div>

      <BottomNav active={activeScreen} onChange={setActiveScreen} />
    </div>
  );
}

export default App;
