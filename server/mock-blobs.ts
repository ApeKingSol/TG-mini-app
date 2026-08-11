
const stores = new Map<string, Map<string, any>>();
export function getStore(nameOrOptions: string | { name: string, consistency?: string }) {
  const name = typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions.name;
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  const store = stores.get(name)!;
  return {
    get: async (key: string, options?: any) => store.get(key) ?? null,
    setJSON: async (key: string, value: any, options?: any) => { 
        if (options?.onlyIfMatch && options.onlyIfMatch !== 'mock-etag') return { modified: false };
        store.set(key, value); 
        return { modified: true }; 
    },
    delete: async (key: string) => store.delete(key),
    list: async (options?: { prefix: string }) => {
       const blobs = [];
       for (const key of store.keys()) {
          if (!options?.prefix || key.startsWith(options.prefix)) {
             blobs.push({ key });
          }
       }
       return { blobs };
    },
    getWithMetadata: async (key: string) => {
       const val = store.get(key);
       if (val !== undefined) return { data: val, etag: 'mock-etag' };
       return null;
    }
  };
}
