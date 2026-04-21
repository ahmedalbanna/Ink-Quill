import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  isTypewriter: boolean;
  isSuperZen: boolean;
  showAIAssistant: boolean;
  showSearch: boolean;
  showMobileMenu: boolean;
  showSettings: boolean;
  showAiSettings: boolean;
  showSavedConversations: boolean;
  direction: 'ltr' | 'rtl';
  isIndexing: boolean;
  
  toggleTypewriter: () => void;
  toggleSuperZen: () => void;
  toggleAIAssistant: () => void;
  setTypewriter: (show: boolean | ((prev: boolean) => boolean)) => void;
  setSuperZen: (show: boolean | ((prev: boolean) => boolean)) => void;
  setAIAssistant: (show: boolean | ((prev: boolean) => boolean)) => void;
  setSearch: (show: boolean | ((prev: boolean) => boolean)) => void;
  setMobileMenu: (show: boolean | ((prev: boolean) => boolean)) => void;
  setSettings: (show: boolean | ((prev: boolean) => boolean)) => void;
  setAiSettings: (show: boolean | ((prev: boolean) => boolean)) => void;
  setSavedConversations: (show: boolean | ((prev: boolean) => boolean)) => void;
  setDirection: (direction: 'ltr' | 'rtl' | ((prev: 'ltr' | 'rtl') => 'ltr' | 'rtl')) => void;
  setIndexing: (indexing: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isTypewriter: false,
      isSuperZen: false,
      showAIAssistant: false,
      showSearch: false,
      showMobileMenu: false,
      showSettings: false,
      showAiSettings: false,
      showSavedConversations: false,
      direction: 'ltr',
      isIndexing: false,

      toggleTypewriter: () => set((state) => ({ isTypewriter: !state.isTypewriter })),
      toggleSuperZen: () => set((state) => ({ isSuperZen: !state.isSuperZen })),
      toggleAIAssistant: () => set((state) => ({ showAIAssistant: !state.showAIAssistant })),
      setTypewriter: (isTypewriter) => set((state) => ({ 
        isTypewriter: typeof isTypewriter === 'function' ? isTypewriter(state.isTypewriter) : isTypewriter 
      })),
      setSuperZen: (isSuperZen) => set((state) => ({ 
        isSuperZen: typeof isSuperZen === 'function' ? isSuperZen(state.isSuperZen) : isSuperZen 
      })),
      setAIAssistant: (showAIAssistant) => set((state) => ({ 
        showAIAssistant: typeof showAIAssistant === 'function' ? showAIAssistant(state.showAIAssistant) : showAIAssistant 
      })),
      setSearch: (showSearch) => set((state) => ({ 
        showSearch: typeof showSearch === 'function' ? showSearch(state.showSearch) : showSearch 
      })),
      setMobileMenu: (showMobileMenu) => set((state) => ({ 
        showMobileMenu: typeof showMobileMenu === 'function' ? showMobileMenu(state.showMobileMenu) : showMobileMenu 
      })),
      setSettings: (showSettings) => set((state) => ({ 
        showSettings: typeof showSettings === 'function' ? showSettings(state.showSettings) : showSettings 
      })),
      setAiSettings: (showAiSettings) => set((state) => ({ 
        showAiSettings: typeof showAiSettings === 'function' ? showAiSettings(state.showAiSettings) : showAiSettings 
      })),
      setSavedConversations: (showSavedConversations) => set((state) => ({ 
        showSavedConversations: typeof showSavedConversations === 'function' ? showSavedConversations(state.showSavedConversations) : showSavedConversations 
      })),
      setDirection: (direction) => set((state) => ({ 
        direction: typeof direction === 'function' ? direction(state.direction) : direction 
      })),
      setIndexing: (isIndexing) => set({ isIndexing }),
    }),
    {
      name: 'ink-quill-ui-storage',
    }
  )
);
