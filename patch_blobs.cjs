const fs = require('fs');
let code = fs.readFileSync('server/mock-blobs.ts', 'utf8');

code = code.replace(
  'setJSON: async (key: string, value: any, options?: any) => {',
  `setJSON: async (key: string, value: any, options?: any) => {
         if (options?.onlyIfNew && store.has(key)) return { modified: false };
         if (options?.onlyIfMatch && options.onlyIfMatch !== 'mock-etag') return { modified: false };
        store.set(key, value); 
         return { modified: true }; 
     },
    set: async (key: string, value: any, options?: any) => {
         if (options?.onlyIfNew && store.has(key)) return { modified: false };`
);

fs.writeFileSync('server/mock-blobs.ts', code);
