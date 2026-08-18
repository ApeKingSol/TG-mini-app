const fs = require('fs');
const file = 'netlify/functions/create-invoice.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  "type InvoiceItem = 'overclock_24h' | 'mega_overclock_72h';",
  "type InvoiceItem = 'overclock_24h' | 'mega_overclock_72h' | 'buy_neon_50' | 'buy_neon_200' | 'buy_neon_1000';"
);

src = src.replace(
  "overclock_24h: {",
  `buy_neon_50: {
    title: '50 NEON Pack',
    description: 'Instantly grants 50 NEON.',
    priceStars: 15,
  },
  buy_neon_200: {
    title: '200 NEON Pack',
    description: 'Instantly grants 200 NEON.',
    priceStars: 49,
  },
  buy_neon_1000: {
    title: '1000 NEON Pack',
    description: 'Instantly grants 1000 NEON.',
    priceStars: 499,
  },
  overclock_24h: {`
);

fs.writeFileSync(file, src);
