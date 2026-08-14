import handler from './netlify/functions/syndicates.mts';
const req = new Request('http://localhost/api/syndicates?mine=1', {
  headers: { 'x-telegram-init-data': 'query_id=AAHd...' }
});
handler(req).then(async (res) => {
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}).catch(err => {
  console.error('Crash:', err);
});
