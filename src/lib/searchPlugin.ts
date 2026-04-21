import { Node } from 'prosemirror-model';
import { Plugin, PluginKey, Transaction, EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const searchPluginKey = new PluginKey('search');

export interface SearchOptions {
  isCaseSensitive: boolean;
  isWholeWord: boolean;
  searchIndex: number; // The global character index (from App.tsx)
  currentMatchIndex: number; // The 1-based index of the current match
}

class SearchIndex {
  private index = new Map<string, number[]>(); // word -> positions
  private docVersion = -1;
  private isIndexing = false;

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

  findMatches(doc: Node, query: string, options: SearchOptions): { start: number, end: number, isCurrent: boolean }[] {
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
          options: { isCaseSensitive: false, isWholeWord: false, searchIndex: -1, currentMatchIndex: 0 } as SearchOptions
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
          const matches = searchIndex.findMatches(newState.doc, nextQuery, nextOptions);
          const decorations = matches.map(m => Decoration.inline(m.start, m.end, {
            class: m.isCurrent 
              ? "search-match-current bg-minimal-accent text-white shadow-[0_0_15px_rgba(var(--minimal-accent-rgb),0.8)] ring-2 ring-minimal-accent z-10 scale-[1.05] inline-block transition-all duration-300 rounded-[2px] px-[1.5px] -mx-[1.5px]" 
              : "search-match bg-minimal-accent/20 border-b-2 border-minimal-accent/40 transition-all duration-300 rounded-[2px] px-[1.5px] -mx-[1.5px]"
          }));
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
