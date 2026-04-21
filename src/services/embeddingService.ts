export interface Chunk {
  text: string;
  embedding: number[];
  id: string;
  hash?: string; // Add hash for incremental indexing
}

class EmbeddingService {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, (embedding: number[]) => void>();
  private isReady = false;
  private readyPromise: Promise<void> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.worker = new Worker(new URL('./embedding.worker.ts', import.meta.url), {
        type: 'module'
      });
      
      this.readyPromise = new Promise((resolve) => {
        this.worker!.onmessage = (event) => {
          const { type, embedding, id, error } = event.data;
          
          if (type === 'ready') {
            this.isReady = true;
            resolve();
          } else if (type === 'embedding' && id) {
            const resolveReq = this.pendingRequests.get(id);
            if (resolveReq) {
              resolveReq(embedding);
              this.pendingRequests.delete(id);
            }
          } else if (type === 'error') {
            console.error('Embedding Worker Error:', error);
          }
        };
      });

      this.worker.postMessage({ type: 'init' });
    }
  }

  async init() {
    return this.readyPromise;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    await this.init();
    if (!this.worker) throw new Error('Worker not initialized');
    
    const id = Math.random().toString(36).substring(7);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Embedding request timed out'));
      }, 30000);

      this.pendingRequests.set(id, (embedding) => {
        clearTimeout(timeout);
        resolve(embedding);
      });
      
      this.worker!.postMessage({ type: 'embed', text, id });
    });
  }

  cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dotProduct += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return isNaN(similarity) ? 0 : similarity;
  }
}

export const embeddingService = new EmbeddingService();

export class VectorStore {
  private chunks: Chunk[] = [];
  private dbName = 'ink-quill-rag';
  private storeName = 'chunks';
  private episodesStoreName = 'episodes';
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private episodes: Chunk[] = [];

  async init() {
    if (this.isInitialized) return;

    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadFromDB().then(() => {
          this.isInitialized = true;
          resolve();
        });
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.episodesStoreName)) {
          db.createObjectStore(this.episodesStoreName, { keyPath: 'id' });
        }
      };
    });
  }

  private async loadFromDB() {
    if (!this.db) return;

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName, this.episodesStoreName], 'readonly');
      
      const chunksStore = transaction.objectStore(this.storeName);
      const chunksRequest = chunksStore.getAll();
      
      const episodesStore = transaction.objectStore(this.episodesStoreName);
      const episodesRequest = episodesStore.getAll();

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        this.chunks = chunksRequest.result || [];
        this.episodes = episodesRequest.result || [];
        console.log(`Loaded ${this.chunks.length} chunks and ${this.episodes.length} episodes from IndexedDB.`);
        resolve();
      };
    });
  }

  private async saveToDB(chunks: Chunk[], storeName: string = this.storeName) {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      chunks.forEach(chunk => store.put(chunk));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async setChunks(chunks: Chunk[]) {
    await this.clear(this.storeName);
    this.chunks = chunks;
    await this.saveToDB(chunks, this.storeName);
  }

  async addChunks(chunks: Chunk[]) {
    this.chunks = [...this.chunks, ...chunks];
    await this.saveToDB(chunks, this.storeName);
  }

  async setEpisodes(episodes: Chunk[]) {
    await this.clear(this.episodesStoreName);
    this.episodes = episodes;
    await this.saveToDB(episodes, this.episodesStoreName);
  }

  async addEpisodes(episodes: Chunk[]) {
    this.episodes = [...this.episodes, ...episodes];
    await this.saveToDB(episodes, this.episodesStoreName);
  }

  async clear(storeName: string = this.storeName) {
    if (!this.db) await this.init();
    if (!this.db) return;

    if (storeName === this.storeName) this.chunks = [];
    if (storeName === this.episodesStoreName) this.episodes = [];
    
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  getChunks() {
    return this.chunks;
  }

  getEpisodes() {
    return this.episodes;
  }

  search(queryEmbedding: number[], limit = 5, threshold = 0.3): Chunk[] {
    return this.searchWithScores(queryEmbedding, limit, threshold, this.chunks).map(s => s.chunk);
  }

  searchEpisodes(queryEmbedding: number[], limit = 3, threshold = 0.3): Chunk[] {
    return this.searchWithScores(queryEmbedding, limit, threshold, this.episodes).map(s => s.chunk);
  }

  searchWithScores(queryEmbedding: number[], limit = 5, threshold = 0.3, targetChunks = this.chunks): { chunk: Chunk; score: number }[] {
    return targetChunks.map(chunk => ({
      chunk,
      score: embeddingService.cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

export const vectorStore = new VectorStore();
// Initialize vector store
vectorStore.init().catch(console.error);
