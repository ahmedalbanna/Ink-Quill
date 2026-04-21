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
    if (!embeddingService.isReady()) return;
    
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
      
      useUIStore.getState().setIndexedCounts(updatedChunks.length, vectorStore.getEpisodes().length);
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
      
      useUIStore.getState().setIndexedCounts(vectorStore.getChunks().length, vectorStore.getEpisodes().length);
      console.log(`Indexed conversation ${id} into episodic memory.`);
    } catch (e) {
      console.error('Error indexing conversation:', e);
    } finally {
      useUIStore.getState().setIndexing(false);
    }
  }

  async getRelevantEpisodes(query: string, limit = 3): Promise<string> {
    if (!embeddingService.isReady()) return '';
    const queryEmbedding = await this.getCachedEmbedding(query);
    const results = vectorStore.searchEpisodes(queryEmbedding, limit, 0.3);
    
    if (results.length === 0) return '';
    return results.map(res => res.text).join('\n\n---\n\n');
  }

  async getRelevantContext(query: string, limit = 5): Promise<string> {
    return this.getWeightedContext([{ text: query, weight: 1.0 }], limit);
  }

  async getWeightedContext(queries: { text: string; weight: number }[], limit = 5): Promise<string> {
    if (!embeddingService.isReady()) return '';
    
    // We'll perform searches for each query and aggregate results with weights
    const resultsMap = new Map<string, { chunk: Chunk; score: number }>();
    
    for (const { text, weight } of queries) {
      if (!text || !text.trim()) continue;
      
      try {
        const queryEmbedding = await this.getCachedEmbedding(text);
        // Search more than we need so we can aggregate and re-rank
        const results = vectorStore.searchWithScores(queryEmbedding, limit * 3, 0.2);
        
        for (const { chunk, score } of results) {
          const weightedScore = score * weight;
          const existing = resultsMap.get(chunk.id);
          if (existing) {
            // If the chunk is hit by multiple query components, it's very relevant
            existing.score += weightedScore;
          } else {
            resultsMap.set(chunk.id, { chunk, score: weightedScore });
          }
        }
      } catch (e) {
        console.error(`Weighted search error for query component "${text.substring(0, 50)}...":`, e);
      }
    }
    
    const sorted = Array.from(resultsMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
      
    if (sorted.length === 0) return '';
    
    // Join chunks with clear separators for the AI
    return sorted.map((s, i) => `[RELEVANT CLIP ${i + 1}]\n${s.chunk.text}`).join('\n\n---\n\n');
  }

  async getGlobalSummary(content: string): Promise<string> {
    const lines = content.split('\n');
    const sections: { level: number; title: string; summary: string }[] = [];
    
    let currentParagraphs: string[] = [];
    let lastHeading: { level: number; title: string } | null = null;
    
    const captureSection = () => {
      if (lastHeading) {
        const text = currentParagraphs.join(' ');
        const summary = text.length > 150 ? text.substring(0, 150) + "..." : text;
        sections.push({ ...lastHeading, summary });
        currentParagraphs = [];
      }
    };

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        captureSection();
        lastHeading = {
          level: headingMatch[1].length,
          title: headingMatch[2].trim()
        };
      } else if (line.trim() && lastHeading) {
        currentParagraphs.push(line.trim());
      }
    }
    captureSection();
    
    if (sections.length === 0) {
      // Fallback if no headings: just a high level summary of first 200 chars
      const text = content.trim().substring(0, 200);
      return text ? `Document Abstract: ${text}${content.length > 200 ? '...' : ''}` : '';
    }
    
    const outline = sections.map(s => {
      const indent = "  ".repeat(s.level - 1);
      return `${indent}${s.level === 1 ? '■' : '□'} ${s.title}\n${indent}  └─ ${s.summary || '(Empty Section)'}`;
    }).join('\n');
    
    const summary = `DOCUMENT STRUCTURAL MAP:\n${outline}`;
    return this.trimToTokens(summary, 800);
  }

  async getCursorSectionInfo(content: string, cursorContext: string): Promise<string> {
    // Attempt to identify which section the cursor is in
    if (!cursorContext) return '';
    
    const lines = content.split('\n');
    let currentSection = 'Introduction / Header';
    
    // Simple heuristic: find the last heading before the cursor context appears
    // Since we don't have absolute byte offset, we search for the cursorContext string
    const cursorIdx = content.indexOf(cursorContext);
    if (cursorIdx === -1) return '';
    
    const contentBeforeCursor = content.substring(0, cursorIdx);
    const headings = [...contentBeforeCursor.matchAll(/^(#{1,6})\s+(.+)$/gm)];
    
    if (headings.length > 0) {
      const last = headings[headings.length - 1];
      currentSection = last[2].trim();
    }
    
    return currentSection;
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
