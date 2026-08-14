import { getStore } from '@netlify/blobs';
getStore('test').get('doesnotexist', { type: 'text' })
  .then(res => console.log('Result:', res))
  .catch(err => console.log('Error:', err));
