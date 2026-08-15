const fs = require('fs');
const file = 'src/screens/ReferralsScreen.tsx';
let src = fs.readFileSync(file, 'utf8');

src = src.replace(
  /function buildReferralLink.*?Tap in:'\;/s,
  `function buildReferralLink(userId: string): string {
  // Use standard t.me/botname?startapp= syntax so Telegram parses it correctly
  // and displays the bot's custom thumbnail image/title in the chat preview.
  return \`https://t.me/\${BOT_USERNAME}?startapp=ref_\${userId}\`;
}

const REFERRAL_SHARE_TEXT =
  'Join me in Cyber-Garage — build your rig, race The Streets, and stack $NEON before the airdrop.';`
);

src = src.replace(
  `const pendingReferrals = Math.max(0, (totalReferralsCount || 0) - (validReferralsCount || 0));`,
  `// Allow negative visual math just in case valid > total during an async fetch gap, but cap visual display at 0
  const pendingReferrals = Math.max(0, (totalReferralsCount || 0) - (validReferralsCount || 0));`
);

fs.writeFileSync(file, src);
