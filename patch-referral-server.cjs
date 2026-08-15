const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

// We need to import getStore to read/write referral links
if (!src.includes('const referralLinks = getStore({ name: \'referral-links\'')) {
  // It's already importing getStore
}

const handleMessageRegex = /async function handleMessage\(message: NonNullable<TelegramUpdate\['message'\]>\): Promise<void> \{([\s\S]*?)\n\}/;

const newHandleMessage = `async function handleMessage(message: NonNullable<TelegramUpdate['message']>, reqUrl: string): Promise<void> {
  if (!message.from) return;

  if (message.successful_payment) {
    await handleSuccessfulPayment(message.successful_payment, message.from.id);
    return;
  }

  if (message.text && message.text.startsWith('/start')) {
    const parts = message.text.trim().split(/\\s+/);
    const payload = parts.length > 1 ? parts[1] : '';

    // Register referral directly on the server if payload starts with ref_
    if (payload.startsWith('ref_')) {
      const referrerId = payload.replace('ref_', '');
      const inviteeId = String(message.from.id);
      
      if (referrerId !== inviteeId) {
        const saves = getStore({ name: 'game-saves', consistency: 'strong' });
        const referralLinks = getStore({ name: 'referral-links', consistency: 'strong' });
        
        const referrerSave = await saves.get(referrerId, { type: 'json' });
        if (referrerSave) {
          const link = { inviterId: referrerId, linkedAt: Date.now() };
          const result = await referralLinks.setJSON(inviteeId, link, { onlyIfNew: true });
          
          if (result.modified) {
            // Increment totalReferralsCount
            const existing = await saves.getWithMetadata(referrerId, { type: 'json' });
            if (existing && existing.data) {
              const record = existing.data as any;
              const updated = {
                ...record,
                totalReferralsCount: (record.totalReferralsCount || 0) + 1,
                lastSaved: Date.now()
              };
              await saves.setJSON(referrerId, updated, { onlyIfMatch: existing.etag });
            }
          }
        }
      }
    }

    const welcomeText = 'Welcome to Cyber-Garage! Build your rig, race The Streets, and stack $NEON before the airdrop.\\n\\nTap the button below to launch the game:';
    
    // We use web_app button using the exact host from the request
    const origin = new URL(reqUrl).origin;
    const webAppUrl = \`\${origin}\${payload ? '?tgWebAppStartParam=' + payload : ''}\`;

    await sendMessage(BOT_TOKEN!, message.from.id, welcomeText, {
      inline_keyboard: [[
        {
          text: "Launch Cyber-Garage 🏁",
          web_app: { url: webAppUrl }
        }
      ]]
    }).catch(err => console.error("Failed to send welcome message:", err));
  }
}`;

src = src.replace(handleMessageRegex, newHandleMessage);

// Also need to pass req.url to handleMessage
src = src.replace(/await handleMessage\(update\.message\);/, 'await handleMessage(update.message, req.url);');

fs.writeFileSync(file, src);
