import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  lineHeight: number;
  maxWidth: string;
  fontFamily: string;
  
  setTheme: (theme: SettingsState['theme'] | ((prev: SettingsState['theme']) => SettingsState['theme'])) => void;
  setFontSize: (size: number | ((prev: number) => number)) => void;
  setLineHeight: (height: number | ((prev: number) => number)) => void;
  setMaxWidth: (width: string | ((prev: string) => string)) => void;
  setFontFamily: (font: string | ((prev: string) => string)) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      fontSize: 16,
      lineHeight: 1.6,
      maxWidth: '800px',
      fontFamily: 'Inter, sans-serif',

      setTheme: (theme) => set((state) => ({ 
        theme: typeof theme === 'function' ? theme(state.theme) : theme 
      })),
      setFontSize: (fontSize) => set((state) => ({ 
        fontSize: typeof fontSize === 'function' ? fontSize(state.fontSize) : fontSize 
      })),
      setLineHeight: (lineHeight) => set((state) => ({ 
        lineHeight: typeof lineHeight === 'function' ? lineHeight(state.lineHeight) : lineHeight 
      })),
      setMaxWidth: (maxWidth) => set((state) => ({ 
        maxWidth: typeof maxWidth === 'function' ? maxWidth(state.maxWidth) : maxWidth 
      })),
      setFontFamily: (fontFamily) => set((state) => ({ 
        fontFamily: typeof fontFamily === 'function' ? fontFamily(state.fontFamily) : fontFamily 
      })),
    }),
    {
      name: 'ink-quill-settings',
    }
  )
);
