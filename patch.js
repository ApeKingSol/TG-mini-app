const fs = require('fs');
let content = fs.readFileSync('netlify/functions/night-siege.mts', 'utf8');
content = content.replace(
`async function verifyMembership(
  user: VerifiedTelegramUser,
  syndicateId: string,
  membership: ReturnType<typeof getStore>,
): Promise<boolean> {
  const mySyndicateId = await membership.get(user.id, { type: 'text' });
  return String(mySyndicateId) === String(syndicateId);
}`,
`async function verifyMembership(
  user: VerifiedTelegramUser,
  syndicateId: string,
  membership: ReturnType<typeof getStore>,
): Promise<boolean> {
  const mySyndicateId = await membership.get(user.id, { type: 'text' });
  console.log("verifyMembership DEBUG:", { userId: user.id, syndicateId, mySyndicateId, isEqual: String(mySyndicateId) === String(syndicateId) });
  return String(mySyndicateId) === String(syndicateId);
}`
);
fs.writeFileSync('netlify/functions/night-siege.mts', content);
