const fs = require('fs');
const file = 'netlify/functions/telegram-webhook.mts';
let src = fs.readFileSync(file, 'utf8');

const oldLogic = `  const saves = getStore({ name: 'game-saves', consistency: 'strong' });
  const userId = String(payerId);
  const existing = await saves.getWithMetadata(userId, { type: 'json' });
  // No save on file for this Telegram id yet — this can only happen if someone manages to pay
  // an invoice before ever opening the Mini App for real, which shouldn't be reachable (the
  // invoice itself is only ever created from inside an already-running session). Nothing safe
  // to merge a boost into, so this deliberately does nothing rather than fabricate a save.
  if (!existing) return;

  const record = existing.data as {
    boostEndsAt?: number | null;
    megaBoostEndsAt?: number | null;
    [key: string]: unknown;
  };
  const now = Date.now();
  const durationMs = (grant.boostHours || 0) * 60 * 60 * 1000;
  const updated = {
    ...record,
    // Both tiers extend this same shared multiplier clock, by however many hours their own
    // tier is worth.
    boostEndsAt: grant.boostHours ? Math.max(now, record.boostEndsAt ?? 0) + durationMs : record.boostEndsAt,
    // Only the Mega tier also extends this — see ITEM_GRANTS' own doc comment above for why
    // it's tracked as its own field rather than reusing boostEndsAt for the AFK-cap decision.
    ...(grant.neon && {
      neon: (record.neon !== undefined ? Number(record.neon) : 0) + grant.neon,
      neonHistory: [
        { id: Math.random().toString(36).substring(2, 15), amount: grant.neon, label: "Purchased with Telegram Stars", timestamp: now },
        ...(Array.isArray(record.neonHistory) ? record.neonHistory : [])
      ].slice(0, 50),
    }),
    ...(grant.alsoExtendsMegaOfflineCap && {
      megaBoostEndsAt: Math.max(now, record.megaBoostEndsAt ?? 0) + durationMs,
    }),
    // Bumping lastSaved is what makes useCloudSync.ts's "only adopt remote if newer than
    // local" check actually pick this up on the player's next pull — without it, this write
    // would sit in Blobs forever, invisible to a client that already has an equal/newer save.
    lastSaved: now,
  };
  const result = await saves.setJSON(userId, updated, { onlyIfMatch: existing.etag });
  // A conflicting concurrent write here (another tab open, or a still-in-flight client push)
  // isn't retried — this is a single player's own save, so the next natural pull/push cycle
  // (useCloudSync polls every 2s) will reconcile it on its own; the idempotency guard above
  // only exists to stop *this exact charge* from ever granting twice, not to force delivery.
  void result;`;

const newLogic = `  const saves = getStore({ name: 'game-saves', consistency: 'strong' });
  const userId = String(payerId);
  
  // We MUST retry if there's an etag mismatch. If the client happened to push a save exactly while
  // this webhook was running, and we just give up, the idempotency key is already consumed and the
  // user's purchase is permanently lost.
  let attempts = 0;
  while (attempts < 5) {
    const existing = await saves.getWithMetadata(userId, { type: 'json' });
    if (!existing) return;

    const record = existing.data as {
      boostEndsAt?: number | null;
      megaBoostEndsAt?: number | null;
      neon?: number;
      neonHistory?: any[];
      [key: string]: unknown;
    };
    const now = Date.now();
    const durationMs = (grant.boostHours || 0) * 60 * 60 * 1000;
    
    const updated = {
      ...record,
      boostEndsAt: grant.boostHours ? Math.max(now, record.boostEndsAt ?? 0) + durationMs : record.boostEndsAt,
      ...(grant.neon && {
        neon: (record.neon !== undefined ? Number(record.neon) : 0) + grant.neon,
        neonHistory: [
          { id: Math.random().toString(36).substring(2, 15), amount: grant.neon, label: "Purchased with Telegram Stars", timestamp: now },
          ...(Array.isArray(record.neonHistory) ? record.neonHistory : [])
        ].slice(0, 50),
      }),
      ...(grant.alsoExtendsMegaOfflineCap && {
        megaBoostEndsAt: Math.max(now, record.megaBoostEndsAt ?? 0) + durationMs,
      }),
      lastSaved: now,
    };
    
    const result = await saves.setJSON(userId, updated, { onlyIfMatch: existing.etag });
    if (result.modified) {
      return; // Grant successful
    }
    
    attempts++;
    // Wait briefly before retrying the fetch-modify-write cycle
    await new Promise(resolve => setTimeout(resolve, 500));
  }`;

src = src.replace(oldLogic, newLogic);
fs.writeFileSync(file, src);
