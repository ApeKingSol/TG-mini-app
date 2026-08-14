import fs from 'fs';
import path from 'path';
import { getStore as getNetlifyStore } from '@netlify/blobs';

const DATA_FILE = path.join(process.cwd(), '.data', 'blobs.json');
let stores = new Map<string, Map<string, any>>();

function loadFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(data);
      stores = new Map();
      for (const [storeName, storeData] of Object.entries(parsed)) {
        stores.set(storeName, new Map(Object.entries(storeData as any)));
      }
    }
  } catch (err) {
    console.error('Failed to load blobs from disk:', err);
  }
}

function saveToDisk() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const obj: any = {};
    for (const [storeName, storeMap] of stores.entries()) {
      obj[storeName] = Object.fromEntries(storeMap.entries());
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('Failed to save blobs to disk:', err);
  }
}

loadFromDisk();

export function getStore(nameOrOptions: string | { name: string, consistency?: string }) {
  if (process.env.NETLIFY) {
    return getNetlifyStore(nameOrOptions);
  }

  const name = typeof nameOrOptions === 'string' ? nameOrOptions : nameOrOptions.name;
  if (!stores.has(name)) {
    stores.set(name, new Map());
    saveToDisk();
  }
  
  const store = stores.get(name)!;
  
  return {
    get: async (key: string, options?: any) => store.get(key) ?? null,
    setJSON: async (key: string, value: any, options?: any) => {
        if (options?.onlyIfNew && store.has(key)) return { modified: false };
        if (options?.onlyIfMatch && options.onlyIfMatch !== 'mock-etag') return { modified: false };
      store.set(key, value);
        saveToDisk();
      return { modified: true };
    },
    set: async (key: string, value: any, options?: any) => {
        if (options?.onlyIfNew && store.has(key)) return { modified: false };
        if (options?.onlyIfMatch && options.onlyIfMatch !== 'mock-etag') return { modified: false };
      store.set(key, value);
       saveToDisk();
      return { modified: true };
    },
    delete: async (key: string) => {
      store.delete(key);
      saveToDisk();
    },
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
