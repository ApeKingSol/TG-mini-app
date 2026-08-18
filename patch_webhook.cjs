const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  'const ITEM_PRICES_STARS: Record<string, number> = {',
  `const ITEM_PRICES_STARS: Record<string, number> = {
  buy_neon_50: 15,
  buy_neon_200: 49,
  buy_neon_1000: 499,`
);

src = src.replace(
  'const ITEM_GRANTS: Record<string, { boostHours: number; alsoExtendsMegaOfflineCap: boolean }> = {',
  `const ITEM_GRANTS: Record<string, { boostHours?: number; alsoExtendsMegaOfflineCap?: boolean; neon?: number }> = {
  buy_neon_50: { neon: 50 },
  buy_neon_200: { neon: 200 },
  buy_neon_1000: { neon: 1000 },`
);

src = src.replace(
  'const durationMs = grant.boostHours * 60 * 60 * 1000;',
  `const durationMs = (grant.boostHours || 0) * 60 * 60 * 1000;`
);

src = src.replace(
  'boostEndsAt: Math.max(now, record.boostEndsAt ?? 0) + durationMs,',
  `boostEndsAt: grant.boostHours ? Math.max(now, record.boostEndsAt ?? 0) + durationMs : record.boostEndsAt,`
);

src = src.replace(
  '...(grant.alsoExtendsMegaOfflineCap && {',
  `...(grant.neon && {
      neon: (record.neon !== undefined ? Number(record.neon) : 0) + grant.neon,
      neonHistory: [
        { id: Math.random().toString(36).substring(2, 15), amount: grant.neon, label: "Purchased with Telegram Stars", timestamp: now },
        ...(Array.isArray(record.neonHistory) ? record.neonHistory : [])
      ].slice(0, 50),
    }),
    ...(grant.alsoExtendsMegaOfflineCap && {`
);

fs.writeFileSync(file, src);
