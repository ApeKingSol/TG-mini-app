import { getStore } from '@netlify/blobs';

let isNetlifyBlobsAvailable = false;
try {
  const store = getStore('test');
  // Just calling getStore throws if it's not configured!
  isNetlifyBlobsAvailable = true;
} catch (err) {
  isNetlifyBlobsAvailable = false;
}
console.log({ isNetlifyBlobsAvailable });
