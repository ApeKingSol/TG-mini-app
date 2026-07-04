import { useEffect, useState } from 'react';
import { WebApp, isRunningInTelegram } from '../lib/telegram';

interface TelegramContext {
  isTelegram: boolean;
  userFirstName: string | null;
}

/** Initializes the Telegram Web App SDK and exposes basic environment info. Mount once, near the app root. */
export function useTelegram(): TelegramContext {
  const [isTelegram, setIsTelegram] = useState(false);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);

  useEffect(() => {
    const runningInTelegram = isRunningInTelegram();
    setIsTelegram(runningInTelegram);

    if (runningInTelegram) {
      WebApp.ready();
      WebApp.expand();
      setUserFirstName(WebApp.initDataUnsafe.user?.first_name ?? null);
    }
  }, []);

  return { isTelegram, userFirstName };
}
