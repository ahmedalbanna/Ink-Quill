import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { snapshotService, type Snapshot } from '../services/snapshotService';

interface EditorState {
  content: string;
  cursor: { from: number; to: number } | null;
  history: { past: string[]; future: string[] };
  snapshots: Snapshot[];
  wordGoal: number;
  
  setContent: (content: string | ((prev: string) => string)) => void;
  setCursor: (cursor: { from: number; to: number } | null) => void;
  addSnapshot: (content: string, userNote?: string) => Promise<void>;
  loadSnapshots: () => Promise<void>;
  setWordGoal: (goal: number | ((prev: number) => number)) => void;
  clearSnapshots: () => Promise<void>;
  setSnapshots: (snapshots: Snapshot[] | ((prev: Snapshot[]) => Snapshot[])) => void;
  undo: () => void;
  redo: () => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      content: '# Welcome to Ink & Quill\n\nStart writing...',
      cursor: null,
      history: { past: [], future: [] },
      snapshots: [],
      wordGoal: 0,
      
      setContent: (content) => set((state) => ({ 
        content: typeof content === 'function' ? content(state.content) : content 
      })),
      setCursor: (cursor) => set({ cursor }),
      addSnapshot: async (content, userNote) => {
        const snapshot = await snapshotService.saveSnapshot(content, userNote);
        set((state) => ({
          snapshots: [snapshot, ...state.snapshots].slice(0, 50),
        }));
      },
      loadSnapshots: async () => {
        const snapshots = await snapshotService.getSnapshots();
        set({ snapshots });
      },
      setWordGoal: (wordGoal) => set((state) => ({ 
        wordGoal: typeof wordGoal === 'function' ? wordGoal(state.wordGoal) : wordGoal 
      })),
      clearSnapshots: async () => {
        await snapshotService.clearAllSnapshots();
        set({ snapshots: [] });
      },
      setSnapshots: (snapshots) => set((state) => ({
        snapshots: typeof snapshots === 'function' ? snapshots(state.snapshots) : snapshots
      })),
      undo: () => {
        set((state) => {
          if (state.history.past.length === 0) return state;
          const previous = state.history.past[state.history.past.length - 1];
          const newPast = state.history.past.slice(0, state.history.past.length - 1);
          return {
            content: previous,
            history: {
              past: newPast,
              future: [state.content, ...state.history.future],
            },
          };
        });
      },
      redo: () => {
        set((state) => {
          if (state.history.future.length === 0) return state;
          const next = state.history.future[0];
          const newFuture = state.history.future.slice(1);
          return {
            content: next,
            history: {
              past: [...state.history.past, state.content],
              future: newFuture,
            },
          };
        });
      },
    }),
    {
      name: 'ink-quill-editor-storage',
      partialize: (state) => ({
        content: state.content,
        wordGoal: state.wordGoal,
        // snapshots are in IndexedDB, cursor/history are session-based
      }),
    }
  )
);
