const DB_NAME = 'ink-quill-snapshots';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

export interface Snapshot {
  id: string;
  timestamp: number;
  content: string;
  wordCount: number;
  userNote?: string;
}

class SnapshotService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  async saveSnapshot(content: string, userNote?: string): Promise<Snapshot> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const snapshot: Snapshot = {
      id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
      timestamp: Date.now(),
      content,
      wordCount,
      userNote,
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(snapshot);

      request.onsuccess = () => resolve(snapshot);
      request.onerror = () => reject(request.error);
    });
  }

  async getSnapshots(): Promise<Snapshot[]> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const snapshots = request.result as Snapshot[];
        // Sort by timestamp descending
        resolve(snapshots.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSnapshot(id: string): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllSnapshots(): Promise<void> {
    await this.init();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const snapshotService = new SnapshotService();
