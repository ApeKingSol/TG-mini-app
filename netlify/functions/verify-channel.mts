import type { Context } from '@netlify/functions';

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!BOT_TOKEN) {
    // If no token is configured, we can't verify. For a strict real integration, we fail.
    return new Response(JSON.stringify({ error: 'Telegram bot not configured', verified: false }), { status: 500, headers: { 'content-type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const userId = body.userId;
    const channelUsername = '@cyber_garage_official'; // The channel to check

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId', verified: false }), { status: 400, headers: { 'content-type': 'application/json' } });
    }

    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember?chat_id=${channelUsername}&user_id=${userId}`);
    const data = await response.json();

    if (data.ok) {
      const status = data.result.status;
      // valid statuses: creator, administrator, member, restricted (if is_member is true)
      if (status === 'creator' || status === 'administrator' || status === 'member' || status === 'restricted') {
        return new Response(JSON.stringify({ verified: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      } else {
        return new Response(JSON.stringify({ verified: false }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    } else {
      console.error('Telegram API error:', data.description);
      // If the chat doesn't exist or bot is not admin, it fails
      return new Response(JSON.stringify({ verified: false, error: data.description }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  } catch (err) {
    console.error('Error in verify-channel:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', verified: false }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
export const config = {
  path: '/api/verify-channel',
};
