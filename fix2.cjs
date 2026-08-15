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

fs.writeFileSync(file, src);
