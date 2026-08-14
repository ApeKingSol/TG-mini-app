import type TelegramWebApp from '@twa-dev/sdk';

// The Telegram client injects `window.Telegram.WebApp` via the script tag loaded in
// index.html. Keep this lookup lazy: on real Telegram launches the React bundle can evaluate
// before the injected object is populated, and freezing that first read at module load time
// leaves every later auth request with empty initData.
export function getTelegramWebApp(): typeof TelegramWebApp | null {
  return (
    window as unknown as { Telegram?: { WebApp?: typeof TelegramWebApp } }
  ).Telegram?.WebApp ?? null;
}

export const WebApp = new Proxy({} as typeof TelegramWebApp, {
  get(_target, prop) {
    const webApp = getTelegramWebApp();
    const value = webApp?.[prop as keyof typeof TelegramWebApp];
    return typeof value === 'function' ? value.bind(webApp) : value;
  },
  set(_target, prop, value) {
    const webApp = getTelegramWebApp();
    if (!webApp) return false;
    (webApp as unknown as Record<PropertyKey, unknown>)[prop] = value;
    return true;
  },
});

/** True when running inside an actual Telegram client, as opposed to a bare browser tab during local dev. */
export function isRunningInTelegram(): boolean {
  const webApp = getTelegramWebApp();
  return webApp !== null && webApp.platform !== 'unknown' && webApp.initData !== '';
}
