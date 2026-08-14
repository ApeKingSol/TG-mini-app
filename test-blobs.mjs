import { getStore } from '@netlify/blobs';
const store = getStore('test');
console.log(Object.keys(store));
