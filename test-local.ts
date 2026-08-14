import { getStore } from './server/mock-blobs.ts';

async function test() {
  const membership = getStore({ name: 'syndicate-membership', consistency: 'strong' });
  const userId = '123456789';
  const mySyndicateId = await membership.get(userId, { type: 'text' });
  console.log('Result for', userId, ':', mySyndicateId);
  const syndicates = getStore({ name: 'syndicates', consistency: 'strong' });
  const list = await syndicates.list();
  console.log('Syndicate blobs:', list.blobs);
  const membershipList = await membership.list();
  console.log('Membership blobs:', membershipList.blobs);
}
test();
