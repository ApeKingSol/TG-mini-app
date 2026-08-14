import { getStore } from './server/mock-blobs.ts';

async function test() {
  const membership = getStore({ name: 'syndicate-membership', consistency: 'strong' });
  const userId = '123456789';
  const syndicateId = '54321';
  
  await membership.set(userId, syndicateId, { onlyIfNew: true });
  
  const mySyndicateId = await membership.get(userId, { type: 'text' });
  console.log({ mySyndicateId, syndicateId, isEqual: String(mySyndicateId) === String(syndicateId) });
}
test();
