import { embeddingService, vectorStore, type Chunk } from './embeddingService';
import type { ChatMessage } from './aiService';
import { useUIStore } from '../stores/uiStore';

export class RagService {
  private lastIndexedContent = '';
  private isIndexing = false;
  private queryCache = new Map<string, number[]>();
  private readonly CACHE_LIMIT = 20;

  async indexDocument(content: string) {
    if (content === this.lastIndexedContent || this.isIndexing) return;
    
    this.isIndexing = true;
    useUIStore.getState().setIndexing(true);
    try {
      console.log('Indexing document for RAG...');
      const texts = this.chunkContent(content);
      
      // Calculate hashes for all current chunks
      const chunksWithHashes = texts.map(text => ({
        text,
        hash: this.simpleHash(text)
      }));

      const existingChunks = vectorStore.getChunks();
      const existingHashMap = new Map(existingChunks.map(c => [c.hash, c]));
      
      const updatedChunks: Chunk[] = [];
      let newEmbeddingsCount = 0;

      for (const item of chunksWithHashes) {
        const existing = existingHashMap.get(item.hash);
        if (existing) {
          updatedChunks.push(existing);
        } else {
          // Generate new embedding
          const embedding = await embeddingService.generateEmbedding(item.text);
          updatedChunks.push({
            text: item.text,
            embedding,
            id: Math.random().toString(36).substring(7),
            hash: item.hash
          });
          newEmbeddingsCount++;
        }
      }
      
      // Update vector store atomically
      await vectorStore.setChunks(updatedChunks);
      
      this.lastIndexedContent = content;
      console.log(`RAG Update: ${updatedChunks.length} chunks total, ${newEmbeddingsCount} newly embedded.`);
    } catch (error) {
      console.error('RAG Indexing error:', error);
    } finally {
      this.isIndexing = false;
      useUIStore.getState().setIndexing(false);
    }
  }

  private simpleHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  private chunkContent(content: string): string[] {
    const CHUNK_SIZE = 1200; // Character target
    const CHUNK_OVERLAP = 200;
    
    const paragraphs = content.split(/\n\n+/);
    const chunks: string[] = [];
    
    let currentChunk = "";
    
    for (const p of paragraphs) {
      if (p.length < 10) continue;
      
      // If a single paragraph is too large, split it
      if (p.length > CHUNK_SIZE) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        const subChunks = p.match(new RegExp(`.{1,${CHUNK_SIZE}}(\\s|$)`, 'g')) || [p];
        chunks.push(...subChunks.map(s => s.trim()).filter(s => s.length > 10));
        continue;
      }

      if (currentChunk.length + p.length > CHUNK_SIZE) {
        chunks.push(currentChunk.trim());
        // Start next chunk with overlap from the end of current chunk
        const overlap = currentChunk.slice(-CHUNK_OVERLAP);
        currentChunk = overlap + (overlap ? "\n\n" : "") + p;
      } else {
        currentChunk += (currentChunk ? "\n\n" : "") + p;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  trimToTokens(text: string, maxTokens: number): string {
    const estimated = this.estimateTokens(text);
    if (estimated <= maxTokens) return text;
    // Rough cut
    return text.substring(0, maxTokens * 4) + "... [truncated]";
  }

  async getCachedEmbedding(query: string): Promise<number[]> {
    if (this.queryCache.has(query)) {
      return this.queryCache.get(query)!;
    }
    const embedding = await embeddingService.generateEmbedding(query);
    this.queryCache.set(query, embedding);
    if (this.queryCache.size > this.CACHE_LIMIT) {
      const firstKey = this.queryCache.keys().next().value;
      this.queryCache.delete(firstKey);
    }
    return embedding;
  }

  async indexConversation(id: string, name: string, messages: ChatMessage[]) {
    try {
      useUIStore.getState().setIndexing(true);
      // Summarize conversation into text
      const content = messages.map(m => `${m.role.toUpperCase()}: ${m.parts[0].text}`).join('\n');
      const text = `Conversation Name: ${name}\n\n${content}`;
      const hash = this.simpleHash(text);

      const existingEpisodes = vectorStore.getEpisodes();
      const existing = existingEpisodes.find(e => e.id === id);

      if (existing && existing.hash === hash) {
        return; // Already up to date
      }

      const embedding = await embeddingService.generateEmbedding(this.trimToTokens(text, 1000));
      const chunk: Chunk = {
        id,
        text: this.trimToTokens(text, 1000), // Keep it within bounds
        embedding,
        hash
      };

      if (existing) {
        // Replace
        const updated = existingEpisodes.map(e => e.id === id ? chunk : e);
        await vectorStore.setEpisodes(updated);
      } else {
        await vectorStore.addEpisodes([chunk]);
      }
      console.log(`Indexed conversation ${id} into episodic memory.`);
    } catch (e) {
      console.error('Error indexing conversation:', e);
    } finally {
      useUIStore.getState().setIndexing(false);
    }
  }

  async getRelevantEpisodes(query: string, limit = 3): Promise<string> {
    const queryEmbedding = await this.getCachedEmbedding(query);
    const results = vectorStore.searchEpisodes(queryEmbedding, limit, 0.3);
    
    if (results.length === 0) return '';
    return results.map(res => res.text).join('\n\n---\n\n');
  }

  async getRelevantContext(query: string, limit = 5): Promise<string> {
    const queryEmbedding = await this.getCachedEmbedding(query);
    // Use the 0.3 threshold
    const results = vectorStore.searchWithScores(queryEmbedding, limit, 0.3);
    
    if (results.length === 0) return '';
    
    const fullContext = results.map(res => res.chunk.text).join('\n\n---\n\n');
    return this.trimToTokens(fullContext, 2000);
  }

  async getGlobalSummary(content: string): Promise<string> {
    const lines = content.split('\n');
    const outline: string[] = [];
    
    let currentSection = "";
    let insideHeading = false;
    
    for (const line of lines) {
      if (line.startsWith('#')) {
        outline.push(line);
        insideHeading = true;
        currentSection = "";
      } else if (insideHeading && line.trim() && outline.length <= 15) {
        // capture first sentence or brief snippet under heading
        currentSection += " " + line.trim();
        if (currentSection.length > 100) {
          outline.push(`  Summary: ${currentSection.substring(0, 100).trim()}...`);
          insideHeading = false;
        }
      }
    }
    
    if (outline.length === 0) return '';
    
    const summary = "Document hierarchical structure:\n" + outline.join('\n');
    return this.trimToTokens(summary, 500);
  }

  buildContext(query: string, documentContent: string, cursorContext: string, chatHistory: any[], maxTokens: number = 4000): { systemInstruction: string, formattedMessages: any[] } {
    // Smart pruning based on token budgets
    // Not strictly implementing full token counting, but an estimate proxy
    // 1. Base instruction + cursor + summary (High Priority)
    // 2. Chat History (High Priority - last few messages)
    // 3. Relevant Document Chunks (Medium Priority)
    // 4. Episodic Memory (Low Priority)
    
    return { systemInstruction: "", formattedMessages: [] }; // We'll move the assembly logic to aiService for cleaner separation
  }
}

export const ragService = new RagService();
