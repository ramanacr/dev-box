import { openDB, type IDBPDatabase } from 'idb';

export class StorageUnavailableError extends Error {
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}


const DB_NAME = 'toolbox-db';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const KEY_PREFIX = 'toolbox/v1/';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw new StorageUnavailableError('IndexedDB storage unavailable in this environment', err);
    });
  }
  return dbPromise;
}

export const WorkspaceStore = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const db = await getDb();
      const namespacedKey = key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
      return (await db.get(STORE_NAME, namespacedKey)) as T | undefined;
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      throw new StorageUnavailableError(`Failed to retrieve key ${key} from storage`, err);
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const db = await getDb();
      const namespacedKey = key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
      await db.put(STORE_NAME, value, namespacedKey);
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      throw new StorageUnavailableError(`Failed to store key ${key}`, err);
    }
  },

  async delete(key: string): Promise<void> {
    try {
      const db = await getDb();
      const namespacedKey = key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
      await db.delete(STORE_NAME, namespacedKey);
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      throw new StorageUnavailableError(`Failed to delete key ${key}`, err);
    }
  },

  async clear(): Promise<void> {
    try {
      const db = await getDb();
      await db.clear(STORE_NAME);
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      throw new StorageUnavailableError('Failed to clear storage', err);
    }
  },
};
