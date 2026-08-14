import { useEffect, useState } from 'react';
import { getTelegramWebApp, isRunningInTelegram } from '../lib/telegram';

interface TelegramContext {
  isReady: boolean;
  isTelegram: boolean;
  userFirstName: string | null;
  /** Per Telegram's own docs, `photo_url` is "only returned for Mini Apps launched from the
   * attachment menu" — null for every other launch method (bot menu button, direct link,
   * ...), which is most of them. Treat this as a nice-to-have, not a guarantee. */
  userPhotoUrl: string | null;
}

/** Initializes the Telegram Web App SDK and exposes basic environment info. Mount once, near the app root. */
export function useTelegram(): TelegramContext {
  const [isReady, setIsReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: number | null = null;
    const launchedByTelegram =
      window.location.hash.includes('tgWebApp') || window.location.search.includes('tgWebApp');
    const startedAt = Date.now();

    const resolveTelegram = () => {
      const webApp = getTelegramWebApp();

      if (webApp) {
        webApp.ready();
      }

      if (isRunningInTelegram() && webApp) {
        webApp.expand();
        const user = webApp.initDataUnsafe.user as
          | (typeof webApp.initDataUnsafe.user & { photo_url?: string })
          | undefined;
        setIsTelegram(true);
        setUserFirstName(user?.first_name ?? null);
        setUserPhotoUrl(user?.photo_url ?? null);
        setIsReady(true);
        return;
      }

      const shouldKeepWaiting =
        launchedByTelegram || (webApp !== null && webApp.platform !== 'unknown');
      if (shouldKeepWaiting && Date.now() - startedAt < 3000) {
        timeoutId = window.setTimeout(resolveTelegram, 50);
        return;
      }

      setIsTelegram(false);
      setUserFirstName(null);
      setUserPhotoUrl(null);
      setIsReady(true);
    };

    resolveTelegram();

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, []);

  return { isReady, isTelegram, userFirstName, userPhotoUrl };
}
