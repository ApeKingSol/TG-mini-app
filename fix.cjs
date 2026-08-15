const fs = require('fs');
let file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /interface TelegramUpdate \{[^}]+\n\s+message\?: \{[^\}]+\};\n\s+successful_payment\?: SuccessfulPayment;\n\s+\};\n\}/s,
  `interface TelegramUpdate {
  pre_checkout_query?: PreCheckoutQuery;
  message?: {
    from?: { id: number };
    text?: string;
    successful_payment?: SuccessfulPayment;
  };
}`
);

fs.writeFileSync(file, src);
