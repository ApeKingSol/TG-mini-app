import type TelegramWebApp from '@twa-dev/sdk';

// The Telegram client injects `window.Telegram.WebApp` via the script tag loaded in
// index.html. We read it directly rather than through `@twa-dev/sdk`'s default export
// (which just re-exports the same global) to sidestep a CJS/ESM interop bug in Vite's
// Rolldown-based dev bundler that mis-unwraps this package's nested default export.
export const WebApp: typeof TelegramWebApp = (window as unknown as { Telegram: { WebApp: typeof TelegramWebApp } })
  .Telegram.WebApp;

/** True when running inside an actual Telegram client, as opposed to a bare browser tab during local dev. */
export function isRunningInTelegram(): boolean {
  return WebApp.platform !== 'unknown' && WebApp.initData !== '';
}
