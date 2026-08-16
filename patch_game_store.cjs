const fs = require('fs');
const file = 'src/game/store/GameStore.ts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace('export function getTelegramUserId(): string | null {', `export function getTelegramUser() {
  try {
    const user = (
      window as unknown as {
        Telegram?: { WebApp?: { initDataUnsafe?: { user?: { id?: number; first_name?: string; username?: string } } } };
      }
    ).Telegram?.WebApp?.initDataUnsafe?.user;
    return user || null;
  } catch {
    return null;
  }
}

export function getTelegramUserId(): string | null {`);

src = src.replace(
  'function createInitialPlayerState(): PlayerState {',
  `function createInitialPlayerState(): PlayerState {
  const user = getTelegramUser();`
);

src = src.replace(
  'return {\n    scrap: 0,',
  `return {
    telegramFirstName: user?.first_name || null,
    telegramUsername: user?.username || null,
    scrap: 0,`
);

// We should also update the state if it doesn't have it on load
src = src.replace(
  'onRehydrateStorage: () => (state) => {',
  `onRehydrateStorage: () => (state) => {
        if (state) {
            localLastSavedAtLoad = state.lastSaved;
            const user = getTelegramUser();
            if (user && (!state.telegramFirstName || state.telegramFirstName !== user.first_name)) {
                state.telegramFirstName = user.first_name || null;
                state.telegramUsername = user.username || null;
            }
        }`
);

fs.writeFileSync(file, src);
