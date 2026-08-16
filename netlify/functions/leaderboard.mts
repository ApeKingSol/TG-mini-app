import type { Context } from '@netlify/functions';
import { getStore } from '../../server/mock-blobs';

const NO_CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  pragma: 'no-cache',
  expires: '0',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_CACHE_HEADERS });
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const savesStore = getStore({ name: 'game-saves', consistency: 'strong' });
  const referralLinks = getStore({ name: 'referral-links' }); // Just if needed

  try {
    const listResult = await savesStore.list();
    const blobs = listResult.blobs;
    
    // We fetch in chunks to avoid overwhelming memory/limits, or just Promise.all
    const users: { id: string, name: string, racesWon: number }[] = [];
    
    const batchSize = 100;
    for (let i = 0; i < blobs.length; i += batchSize) {
      const batch = blobs.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (blob) => {
          const data = await savesStore.get(blob.key, { type: 'json' });
          if (data && typeof data === 'object') {
            return {
              id: blob.key,
              name: `Runner #${blob.key.slice(-4)}`,
              racesWon: (data as any).racesWon || 0, walletAddress: (data as any).walletAddress || null,
            };
          }
          return null;
        })
      );
      
      for (const res of results) {
        if (res && res.racesWon > 0) {
          users.push(res);
        }
      }
    }

    // Sort by racesWon descending
    users.sort((a, b) => b.racesWon - a.racesWon);

    // Top 100
    const topUsers = users.slice(0, 100);

    return jsonResponse({ leaderboard: topUsers });
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    return jsonResponse({ error: 'Failed to load leaderboard' }, 500);
  }
};

export const config = {
  path: '/api/leaderboard',
};
