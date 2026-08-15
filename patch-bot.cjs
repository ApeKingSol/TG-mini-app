const fs = require('fs');

// Patch telegramBotApi.ts
let apiFile = 'netlify/functions/_shared/telegramBotApi.ts';
let apiSrc = fs.readFileSync(apiFile, 'utf8');

if (!apiSrc.includes('sendMessage')) {
  apiSrc += `
export function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: unknown,
): Promise<unknown> {
  return callTelegramApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}
`;
  fs.writeFileSync(apiFile, apiSrc);
}

// Patch telegram-webhook.mts
let hookFile = 'netlify/functions/telegram-webhook.mts';
let hookSrc = fs.readFileSync(hookFile, 'utf8');

hookSrc = hookSrc.replace(
  `import { answerPreCheckoutQuery } from './_shared/telegramBotApi';`,
  `import { answerPreCheckoutQuery, sendMessage } from './_shared/telegramBotApi';`
);

hookSrc = hookSrc.replace(
  /interface TelegramUpdate \{[^}]+\n\s+message\?: \{[^}]+\};/s,
  `interface TelegramUpdate {
  pre_checkout_query?: PreCheckoutQuery;
  message?: {
    from?: { id: number };
    text?: string;
    successful_payment?: SuccessfulPayment;
  };`
);

hookSrc = hookSrc.replace(
  /export default async \(req: Request\) => \{/s,
  `async function handleMessage(message: NonNullable<TelegramUpdate['message']>): Promise<void> {
  if (!message.from) return;

  if (message.successful_payment) {
    await handleSuccessfulPayment(message.successful_payment, message.from.id);
    return;
  }

  if (message.text && message.text.startsWith('/start')) {
    const parts = message.text.trim().split(/\\s+/);
    const payload = parts.length > 1 ? parts[1] : '';

    const BOT_USERNAME = 'garage_mechanic_bot';
    let appUrl = \`https://t.me/\${BOT_USERNAME}/app\`;
    if (payload) {
      appUrl += \`?startapp=\${payload}\`;
    }

    const welcomeText = 'Welcome to Cyber-Garage! Build your rig, race The Streets, and stack $NEON before the airdrop.\\n\\nTap the button below to launch the game:';

    await sendMessage(BOT_TOKEN!, message.from.id, welcomeText, {
      inline_keyboard: [[
        {
          text: "Launch Cyber-Garage 🏁",
          url: appUrl
        }
      ]]
    }).catch(err => console.error("Failed to send welcome message:", err));
  }
}

export default async (req: Request) => {`
);

hookSrc = hookSrc.replace(
  /\} else if \(update\.message\?\.successful_payment && update\.message\.from\) \{[^}]+}/s,
  `} else if (update.message) {
    await handleMessage(update.message);
  }`
);

fs.writeFileSync(hookFile, hookSrc);
