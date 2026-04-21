import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type ChatMessage } from '../services/aiService';

interface AIState {
  chatHistory: ChatMessage[];
  personalInstructions: string;
  selectedModel: string;
  availableModels: string[];
  isGenerating: boolean;
  ollamaStatus: {
    loading: boolean;
    connected: boolean;
    model: string;
    error?: string;
  };
  provider: 'ollama' | 'openai' | 'anthropic';
  apiKeys: {
    openai: string;
    anthropic: string;
  };
  providerConfigs: {
    ollama: {
      host: string;
    };
  };
  savedChats: { id: string; name: string; history: ChatMessage[]; timestamp: number; documentSnapshot?: string }[];
  
  setProvider: (provider: AIState['provider'] | ((prev: AIState['provider']) => AIState['provider'])) => void;
  setApiKey: (provider: 'openai' | 'anthropic', key: string) => void;
  setOllamaHost: (host: string) => void;
  addMessage: (msg: ChatMessage) => void;
  setChatHistory: (history: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  setSavedChats: (chats: AIState['savedChats'] | ((prev: AIState['savedChats']) => AIState['savedChats'])) => void;
  setPersonalInstructions: (instructions: string | ((prev: string) => string)) => void;
  setSelectedModel: (model: string | ((prev: string) => string)) => void;
  setAvailableModels: (models: string[] | ((prev: string[]) => string[])) => void;
  setGenerating: (isGenerating: boolean | ((prev: boolean) => boolean)) => void;
  setOllamaStatus: (status: AIState['ollamaStatus'] | ((prev: AIState['ollamaStatus']) => AIState['ollamaStatus'])) => void;
  clearChatHistory: () => void;
}

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      chatHistory: [],
      personalInstructions: '',
      selectedModel: 'mistral',
      availableModels: [],
      isGenerating: false,
      ollamaStatus: {
        loading: false,
        connected: false,
        model: '',
      },

      provider: 'ollama',
      apiKeys: {
        openai: '',
        anthropic: '',
      },
      providerConfigs: {
        ollama: {
          host: '',
        },
      },
      savedChats: [],

      addMessage: (msg) => set((state) => ({ 
        chatHistory: [...state.chatHistory, msg] 
      })),
      setChatHistory: (chatHistory) => set((state) => ({ 
        chatHistory: typeof chatHistory === 'function' ? chatHistory(state.chatHistory) : chatHistory 
      })),
      setSavedChats: (savedChats) => set((state) => ({ 
        savedChats: typeof savedChats === 'function' ? savedChats(state.savedChats) : savedChats 
      })),
      setPersonalInstructions: (personalInstructions) => set((state) => ({ 
        personalInstructions: typeof personalInstructions === 'function' ? personalInstructions(state.personalInstructions) : personalInstructions 
      })),
      setSelectedModel: (selectedModel) => set((state) => ({ 
        selectedModel: typeof selectedModel === 'function' ? selectedModel(state.selectedModel) : selectedModel 
      })),
      setAvailableModels: (availableModels) => set((state) => ({ 
        availableModels: typeof availableModels === 'function' ? availableModels(state.availableModels) : availableModels 
      })),
      setGenerating: (isGenerating) => set((state) => ({ 
        isGenerating: typeof isGenerating === 'function' ? isGenerating(state.isGenerating) : isGenerating 
      })),
      setOllamaStatus: (ollamaStatus) => set((state) => ({ 
        ollamaStatus: typeof ollamaStatus === 'function' ? ollamaStatus(state.ollamaStatus) : ollamaStatus 
      })),
      setProvider: (provider) => set((state) => ({ 
        provider: typeof provider === 'function' ? provider(state.provider) : provider 
      })),
      setApiKey: (provider, key) => set((state) => ({
        apiKeys: { ...state.apiKeys, [provider]: key }
      })),
      setOllamaHost: (host) => set((state) => ({
        providerConfigs: { ...state.providerConfigs, ollama: { ...state.providerConfigs.ollama, host } }
      })),
      clearChatHistory: () => set({ chatHistory: [] }),
    }),
    {
      name: 'ink-quill-ai-storage',
      partialize: (state) => ({
        personalInstructions: state.personalInstructions,
        selectedModel: state.selectedModel,
        chatHistory: state.chatHistory,
        savedChats: state.savedChats,
        provider: state.provider,
        apiKeys: state.apiKeys,
        providerConfigs: state.providerConfigs,
      }),
    }
  )
);
