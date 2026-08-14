import { getStore } from '@netlify/blobs';
const store = getStore({ name: 'test', siteID: 'test', token: 'test' });
const res = await store.set('key', 'value', { onlyIfNew: true });
console.log('Result:', res);
