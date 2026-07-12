import { AnimatePresence, motion } from 'framer-motion';
import type { ScreenId } from './BottomNav';

/** Each tab has its own atmospheric backdrop. Garage's is the fallback used for the Profile
 * screen too, since Profile has no ScreenId/tab of its own. */
const SCREEN_BACKGROUNDS: Record<ScreenId, string> = {
  garage: '/background_main.webp',
  junkyard: '/background-scrapyard.jpg',
  race: '/background-streets.jpg',
};

interface ScreenBackgroundProps {
  activeScreen: ScreenId;
}

/** Cross-fades the photo behind the app whenever the active tab changes, instead of the old
 * plain CSS `background-image` swap — a bare `url()` change can't be transitioned by CSS at
 * all (it just cuts instantly), so the photo now lives on its own AnimatePresence-keyed layer
 * that fades out/in while the darkening gradient on top stays put, unaffected. */
export function ScreenBackground({ activeScreen }: ScreenBackgroundProps) {
  return (
    <div className="bg-screen-layers">
      <AnimatePresence>
        <motion.div
          key={activeScreen}
          className="bg-photo-layer"
          style={{ backgroundImage: `url('${SCREEN_BACKGROUNDS[activeScreen]}')` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        />
      </AnimatePresence>
      <div className="bg-gradient-overlay" />
    </div>
  );
}
