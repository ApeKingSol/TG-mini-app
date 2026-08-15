const fs = require('fs');
let file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

const regex = /interface TelegramUpdate \{.*?\}/s;
src = src.replace(regex, `interface TelegramUpdate {
  pre_checkout_query?: PreCheckoutQuery;
  message?: {
    from?: { id: number };
    text?: string;
    successful_payment?: SuccessfulPayment;
  };
}`);

// Wait, the regex won't catch the extra curly braces and garbage outside it if it matched the first `}`.
// Let's just fix it properly by finding the whole block:
