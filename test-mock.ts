import { getStore } from './server/mock-blobs.ts';
try {
  getStore('test');
  console.log("Success");
} catch (err) {
  console.log("Caught:", err.message);
}
