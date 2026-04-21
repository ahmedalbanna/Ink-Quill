import { Node } from 'prosemirror-model';
import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { cn } from './utils';

export const searchPluginKey = new PluginKey('search');

export interface SearchOptions {
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  isSemantic: boolean;
  searchIndex: number; // The global character index (from App.tsx)
  currentMatchIndex: number; // The 1-based index of the current match
}

class SearchIndex {
  private index = new Map<string, number[]>(); // word -> positions
  private docVersion = -1;
  private isIndexing = false;
  private semanticMatches: { start: number, end: number, score: number }[] = [];
  private lastSemanticQuery = '';

  update(doc: Node, version: number) {
    if (version === this.docVersion || this.isIndexing) return;
    this.isIndexing = true;

    const runIndexing = () => {
      this.index.clear();
      doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          // Improved word splitting to be more accurate
          const regex = /\b\w+\b/g;
          let m;
          while ((m = regex.exec(node.text)) !== null) {
            const word = m[0].toLowerCase();
            const positions = this.index.get(word) || [];
            positions.push(pos + m.index);
            this.index.set(word, positions);
          }
        }
      });
      this.docVersion = version;
      this.isIndexing = false;
    };

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(runIndexing);
    } else {
      setTimeout(runIndexing, 0);
    }
  }

  async findMatches(doc: Node, query: string, options: SearchOptions): Promise<{ start: number, end: number, isCurrent: boolean, relevance?: number }[]> {
    if (!query) return [];

    if (options.isSemantic) {
      return this.findSemanticMatches(doc, query, options);
    }

    return this.findMatchesSync(doc, query, options);
  }

  findMatchesSync(doc: Node, query: string, options: SearchOptions): { start: number, end: number, isCurrent: boolean, relevance?: number }[] {
    if (!query) return [];

    const matches: { start: number, end: number, isCurrent: boolean }[] = [];
    const lowerQuery = query.toLowerCase();
    
    // Fast path: use index for whole word, case-insensitive, non-regex search
    const isSimpleWholeWord = options.isWholeWord && !options.isCaseSensitive && /^\w+$/.test(query);
    
    if (isSimpleWholeWord && this.index.has(lowerQuery)) {
      const positions = this.index.get(lowerQuery) || [];
      positions.forEach((pos, idx) => {
        const matchCount = idx + 1;
        const isCurrent = options.currentMatchIndex !== 0 && matchCount === options.currentMatchIndex;
        matches.push({ start: pos, end: pos + query.length, isCurrent });
      });
      return matches;
    }

    // Fallback: standard regex scan
    const flags = options.isCaseSensitive ? 'g' : 'gi';
    let pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (options.isWholeWord) pattern = `\\b${pattern}\\b`;

    let matchCount = 0;
    const regex = new RegExp(pattern, flags);

    doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        let m;
        while ((m = regex.exec(node.text)) !== null) {
          matchCount++;
          const start = pos + m.index;
          const end = start + m[0].length;
          const isCurrent = options.currentMatchIndex !== 0 && matchCount === options.currentMatchIndex;
          matches.push({ start, end, isCurrent });
        }
      }
    });

    return matches;
  }

  private async findSemanticMatches(doc: Node, query: string, options: SearchOptions) {
    // Only search semantic if query is long enough and changed
    if (query !== this.lastSemanticQuery) {
      if (query.trim().length < 3) {
        this.semanticMatches = [];
        return [];
      }
      
      const { ragService } = await import('../services/ragService');
      const results = await ragService.searchDetailed(query, 10, 0.2); // threshold 0.2 for broader discovery
      
      const fullText = doc.textContent;
      const matches: { start: number, end: number, score: number }[] = [];
      
      results.forEach(res => {
        // Find positions of this chunk text in the document
        // This is a naive implementation, ideally RAG stores positions
        let startPos = fullText.indexOf(res.text);
        while (startPos !== -1) {
          matches.push({ start: startPos, end: startPos + res.text.length, score: res.score });
          startPos = fullText.indexOf(res.text, startPos + 1);
        }
      });

      this.semanticMatches = matches.sort((a, b) => b.score - a.score);
      this.lastSemanticQuery = query;
    }

    return this.semanticMatches.map((m, idx) => ({
      ...m,
      isCurrent: options.currentMatchIndex !== 0 && (idx + 1) === options.currentMatchIndex,
      relevance: m.score
    }));
  }
}

export const createSearchPlugin = () => {
  const searchIndex = new SearchIndex();

  return new Plugin({
    key: searchPluginKey,
    state: {
      init() {
        return {
          decorations: DecorationSet.empty,
          query: '',
          options: { isCaseSensitive: false, isWholeWord: false, isSemantic: false, searchIndex: -1, currentMatchIndex: 0 } as SearchOptions
        };
      },
      apply(tr, value, oldState, newState) {
        const query = tr.getMeta('searchQuery');
        const options = tr.getMeta('searchOptions');

        const nextQuery = query !== undefined ? query : value.query;
        const nextOptions = options !== undefined ? options : value.options;

        if (tr.docChanged) {
          // Trigger index update on next idle time
          searchIndex.update(newState.doc, newState.doc.content.size); 
        }

        if (!nextQuery) {
          return { decorations: DecorationSet.empty, query: nextQuery, options: nextOptions };
        }

        // Re-calculate decorations if query/options changed or doc changed
        if (query !== undefined || options !== undefined || tr.docChanged) {
          // We can't await in apply, so we handle it asynchronously 
          // In a real plugin, you'd use a meta action to update decorations after the async part
          // For now, we'll use a hack or just trigger a follow-up transaction
          
          const matchesPromise = searchIndex.findMatches(newState.doc, nextQuery, nextOptions);
          
          // Trigger a follow-up if it was an async operation (semantic)
          if (nextOptions.isSemantic && query !== undefined) {
             matchesPromise.then(matches => {
                // Dispatch a transaction with the same query to force re-render with new matches
                const view = (searchPluginKey.get(newState) as any)?.view;
                if (view) {
                   view.dispatch(view.state.tr.setMeta('searchQuery', nextQuery).setMeta('searchOptions', nextOptions));
                }
             });
          }

          // Use sync matches if available (for standard search) or existing semantic matches
          // For the sake of simplicity in this exercise, we'll wrap findMatches to return sync data if possible
          // In a production environment, this would be handled better.
          
          // Let's modify the flow slightly to avoid async apply issues.
          // Since I'm using local state anyway.
          
          // Actually, let's just make findMatches return what it has and use a separate meta for async updates
          
          const matches = (searchIndex as any).semanticMatches && nextOptions.isSemantic 
             ? (searchIndex as any).semanticMatches.map((m: any, idx: number) => ({
                  ...m,
                  isCurrent: nextOptions.currentMatchIndex !== 0 && (idx + 1) === nextOptions.currentMatchIndex,
                  relevance: m.score
               }))
             : (searchIndex as any).findMatchesSync?.(newState.doc, nextQuery, nextOptions) || [];

          const decorations = matches.map((m: any) => {
            const relevanceClass = m.relevance 
               ? m.relevance > 0.8 ? "opacity-100 ring-minimal-accent" : m.relevance > 0.5 ? "opacity-70 ring-minimal-accent/50" : "opacity-40 ring-minimal-accent/20"
               : "";

            return Decoration.inline(m.start, m.end, {
              class: cn(
                m.isCurrent 
                  ? "search-match-current bg-minimal-accent text-white shadow-[0_0_15px_rgba(var(--minimal-accent-rgb),0.8)] ring-2 z-10 scale-[1.05] inline-block transition-all duration-300 rounded-[2px] px-[1.5px] -mx-[1.5px]" 
                  : "search-match bg-minimal-accent/20 border-b-2 border-minimal-accent/40 transition-all duration-300 rounded-[2px] px-[1.5px] -mx-[1.5px]",
                relevanceClass
              ),
              "data-relevance": m.relevance || 0
            });
          });

          return {
            decorations: DecorationSet.create(newState.doc, decorations),
            query: nextQuery,
            options: nextOptions
          };
        }

        return {
          ...value,
          decorations: value.decorations.map(tr.mapping, newState.doc)
        };
      }
    },
    props: {
      decorations(state) {
        return this.getState(state).decorations;
      }
    }
  });
};
