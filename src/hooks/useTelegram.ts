import { useEffect, useState } from 'react';
import { WebApp, isRunningInTelegram } from '../lib/telegram';

interface TelegramContext {
  isTelegram: boolean;
  userFirstName: string | null;
  /** Per Telegram's own docs, `photo_url` is "only returned for Mini Apps launched from the
   * attachment menu" — null for every other launch method (bot menu button, direct link,
   * ...), which is most of them. Treat this as a nice-to-have, not a guarantee. */
  userPhotoUrl: string | null;
}

/** Initializes the Telegram Web App SDK and exposes basic environment info. Mount once, near the app root. */
export function useTelegram(): TelegramContext {
  const [isTelegram, setIsTelegram] = useState(false);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const runningInTelegram = isRunningInTelegram();
    setIsTelegram(runningInTelegram);

    if (runningInTelegram) {
      WebApp.ready();
      WebApp.expand();
      const user = WebApp.initDataUnsafe.user as (typeof WebApp.initDataUnsafe.user & { photo_url?: string }) | undefined;
      setUserFirstName(user?.first_name ?? null);
      setUserPhotoUrl(user?.photo_url ?? null);
    }
  }, []);

  return { isTelegram, userFirstName, userPhotoUrl };
}
