/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Trash2,
  X,
  Search,
  ArrowRightLeft,
  ChevronDown,
  Plus,
  Maximize2 as FocusOn,
  Minimize2 as FocusOff,
  Clock,
  Target,
  Type,
  Check,
  Sparkles,
  Zap,
  Send,
  Languages,
  Menu,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3,
  Settings,
  History,
  Underline,
  Strikethrough as Stroke,
  Save,
  Download,
  ImagePlus,
  FolderOpen,
  FileText,
  Upload,
  Link as LinkIcon,
  Keyboard,
  Database,
  Cpu,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn, useMediaQuery } from './lib/utils';
import ProseMirrorEditor, { EditorRef } from './components/ProseMirrorEditor';
import { generateContentFromPrompt, processAIAction, chatWithAI, checkOllamaConnection, type ChatMessage } from './services/aiService';
import { ragService } from './services/ragService';
import { exportToPDF, exportToHTML, exportToMarkdown, exportToDOCX } from './services/exportService';
import { importFile } from './services/importService';
import { embeddingService, EmbeddingStatus } from './services/embeddingService';
import { useEditorStore } from './stores/editorStore';
import { useUIStore } from './stores/uiStore';
import { useAIStore } from './stores/aiStore';
import { useSettingsStore } from './stores/settingsStore';

const DEFAULT_MARKDOWN = `Here is a detailed guide to **Conducting Gap Analysis (Feature comparison matrices)** written for a **Senior System Analyst & Requirements Engineer**. You will use gap analysis to compare current systems, vendor products, or as-is vs to-be states, and produce actionable requirements for closing the gaps.

## Conducting Gap Analysis (Feature comparison matrices)

As a **Senior System Analyst**, gap analysis is one of your most valuable tools for **bridging the present state to a desired future state**. Whether you are evaluating a commercial off-the-shelf (COTS) product, migrating from a legacy system, or comparing your solution against competitors, you will produce **feature comparison matrices** that drive investment decisions, requirement prioritization, and project scope.

This content covers:
- What gap analysis is (and isn't).
- Step-by-step process for conducting it.

### Feature Comparison Matrix

| Feature | System A (Current) | System B (To-Be) | Gap Status |
| :--- | :--- | :--- | :--- |
| **Real-time Collaboration** | No | Yes | Critical Gap |
| **Markdown Export** | Partial | Full | Minor Gap |
| **AI Writing Partner** | No | Yes | Strategic Gap |
| **Versioning** | Yes | Yes | No Gap |

Enjoy your writing journey with Ink & Quill!
`;

export default function App() {
  const { content: markdown, setContent: setMarkdown, snapshots, wordGoal, setWordGoal, addSnapshot, setSnapshots, loadSnapshots } = useEditorStore();
  const {
    
    isTypewriter, toggleTypewriter, setTypewriter,
    isSuperZen, toggleSuperZen, setSuperZen,
    showAIAssistant: showAiAssistant, setAIAssistant: setAiAssistant,
    showSearch, setSearch,
    showMobileMenu, setMobileMenu,
    showSettings, setSettings,
    showAiSettings, setAiSettings,
    showSavedConversations, setSavedConversations,
    direction, setDirection, isIndexing,
    indexedChunks, indexedEpisodes
  } = useUIStore();
  const {
    chatHistory, setChatHistory,
    personalInstructions: aiPersonalInstructions, setPersonalInstructions: setAiPersonalInstructions,
    selectedModel, setSelectedModel,
    availableModels, setAvailableModels,
    isGenerating: isGeneratingAi, setGenerating: setIsGeneratingAi,
    ollamaStatus, setOllamaStatus,
    addMessage: addChatMessage,
    savedChats, setSavedChats,
    provider, setProvider,
    apiKeys, setApiKey,
    providerConfigs, setOllamaHost
  } = useAIStore();

  const {
    theme, setTheme,
    fontSize, setFontSize,
    lineHeight, setLineHeight,
    maxWidth, setMaxWidth,
    fontFamily, setFontFamily
  } = useSettingsStore();

  const isMobile = useMediaQuery('(max-width: 768px)');

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchIndex, setSearchIndex] = useState(-1);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [isSemantic, setIsSemantic] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showFileActions, setShowFileActions] = useState(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [chatAttachedImages, setChatAttachedImages] = useState<string[]>([]);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const [embeddingStatus, setEmbeddingStatus] = useState<EmbeddingStatus>('idle');
  const [embeddingProgress, setEmbeddingProgress] = useState(0);

  useEffect(() => {
    return embeddingService.subscribe((status, progress) => {
      setEmbeddingStatus(status);
      setEmbeddingProgress(progress);
    });
  }, []);

  useEffect(() => {
    // Initialize chunk counts on load
    import('./services/embeddingService').then(({ vectorStore }) => {
      vectorStore.init().then(() => {
        useUIStore.getState().setIndexedCounts(vectorStore.getChunks().length, vectorStore.getEpisodes().length);
      });
    });
  }, []);

  // Local state for things that don't need persistence yet or are session-based

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("Please upload an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        editorRef.current?.insertImage(dataUrl, file.name);
      }
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (window.confirm("Importing this file will replace your current document. Continue?")) {
      try {
        const content = await importFile(file);
        setMarkdown(content);
        alert("File imported successfully!");
      } catch (error) {
        console.error("Import failed:", error);
        alert("Failed to import file: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    if (importFileInputRef.current) importFileInputRef.current.value = '';
  };

  const handleChatImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          setChatAttachedImages(prev => [...prev, dataUrl]);
        }
      };
      reader.readAsDataURL(file);
    });
    if (chatImageInputRef.current) chatImageInputRef.current.value = '';
  };

  const saveCurrentChat = () => {
    if (chatHistory.length === 0) return;
    const name = window.prompt("Enter a name for this conversation:", `Chat ${new Date().toLocaleString()}`);
    if (!name) return;

    const newChat = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      history: chatHistory,
      timestamp: Date.now(),
      documentSnapshot: markdown
    };

    const updated = [newChat, ...savedChats];
    setSavedChats(updated);
    
    // Index into episodic memory
    ragService.indexConversation(newChat.id, newChat.name, newChat.history);
    
    alert("Conversation saved successfully.");
  };

  const loadChat = (chat: any) => {
    setChatHistory(chat.history);
    setSavedConversations(false);
  };

  const deleteSavedChat = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this saved conversation?")) return;
    const updated = savedChats.filter(c => c.id !== id);
    setSavedChats(updated);
  };

  const exportChat = (history: ChatMessage[], format: 'json' | 'md') => {
    let content = "";
    let filename = `chat-export-${Date.now()}`;

    if (format === 'json') {
      content = JSON.stringify(history, null, 2);
      filename += ".json";
    } else {
      content = history.map(m => `### ${m.role.toUpperCase()}\n\n${m.parts[0].text}`).join('\n\n---\n\n');
      filename += ".md";
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatChatInput = (type: 'bold' | 'italic' | 'list') => {
    if (!chatInputRef.current) return;
    const { selectionStart, selectionEnd } = chatInputRef.current;
    const text = aiPrompt;
    const selected = text.substring(selectionStart, selectionEnd);
    let formatted = "";
    let cursorOffset = 0;

    switch (type) {
      case 'bold':
        formatted = `**${selected}**`;
        cursorOffset = 2;
        break;
      case 'italic':
        formatted = `*${selected}*`;
        cursorOffset = 1;
        break;
      case 'list':
        formatted = `\n- ${selected}`;
        cursorOffset = 3;
        break;
    }

    const newText = text.substring(0, selectionStart) + formatted + text.substring(selectionEnd);
    setAiPrompt(newText);

    // Reset focus and selection
    setTimeout(() => {
      if (chatInputRef.current) {
        chatInputRef.current.focus();
        const newPos = selectionStart + cursorOffset + (selected ? selected.length : 0);
        chatInputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };
  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // Auto-snapshot every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      addSnapshot(markdown);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [markdown, addSnapshot]);

  // Debounced RAG indexing
  useEffect(() => {
    const timeout = setTimeout(() => {
      ragService.indexDocument(markdown);
    }, 5000); // 5s debounce for performance

    return () => clearTimeout(timeout);
  }, [markdown]);

  // Snapshot on document close
  useEffect(() => {
    const handleBeforeUnload = () => {
      addSnapshot(markdown);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [markdown, addSnapshot]);

  useEffect(() => {
    // Apply standard brand colors and font to CSS variables
    const root = document.documentElement;

    // Theme logic
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // CSS variables for colors are handled by index.css based on data-theme

    root.style.setProperty('--minimal-font', fontFamily);
    root.style.setProperty('--editor-font-size', `${fontSize}px`);
    root.style.setProperty('--editor-line-height', lineHeight.toString());
    root.style.setProperty('--editor-max-width', maxWidth);
  }, [theme, fontFamily, fontSize, lineHeight, maxWidth]);

  const insertText = (before: string, after: string = '') => {
    if (!editorRef.current) return;
    editorRef.current.insertText(before, after);
    // Note: markdown state is updated via the onChange callback in ProseMirrorEditor
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Shortcuts (ProseMirror handles many of these internally, but we can override or add)
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'k') {
        e.preventDefault();
        insertText('[', '](url)');
      } else if (e.key === 'f') {
        e.preventDefault();
        setSearch(!showSearch);
        if (!showSearch) {
          setSearchIndex(-1);
        }
      } else if (e.key === 't' && e.shiftKey) {
        e.preventDefault();
        toggleTypewriter();
      } else if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        
      } else if (e.key === '/') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
    }
  };

  useEffect(() => {
    if (!findText) {
      setMatchCount(0);
      setCurrentMatchIndex(0);
      setSearchIndex(-1);
      return;
    }

    if (isSemantic) return; // Managed by editor feedback

    const flags = isCaseSensitive ? 'g' : 'gi';
    let pattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (isWholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    try {
      const regex = new RegExp(pattern, flags);
      const matches = [...markdown.matchAll(regex)];
      setMatchCount(matches.length);

      // Try to find if our searchIndex is in matches
      const idx = matches.findIndex(m => m.index === searchIndex);
      if (idx !== -1) {
        setCurrentMatchIndex(idx + 1);
      } else if (matches.length > 0 && searchIndex === -1) {
        // Just found something for the first time
        // We don't automatically jump to the first match here to avoid jitter, 
        // but we show the count.
        setCurrentMatchIndex(0);
      } else if (matches.length === 0) {
        setCurrentMatchIndex(0);
        setSearchIndex(-1);
      }
    } catch (e) {
      setMatchCount(0);
      setCurrentMatchIndex(0);
    }
  }, [findText, markdown, isCaseSensitive, isWholeWord]);

  const handleFindNext = () => {
    if (!findText || matchCount === 0) return;

    if (isSemantic) {
      const nextIdx = (currentMatchIndex % matchCount) + 1;
      setCurrentMatchIndex(nextIdx);
      return;
    }

    const flags = isCaseSensitive ? 'g' : 'gi';
    let pattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (isWholeWord) pattern = `\\b${pattern}\\b`;

    const regex = new RegExp(pattern, flags);
    const startPos = searchIndex === -1 ? 0 : searchIndex + 1;
    regex.lastIndex = startPos;

    let result = regex.exec(markdown);
    if (!result) {
      // Wrap around
      regex.lastIndex = 0;
      result = regex.exec(markdown);
    }

    if (result) {
      setSearchIndex(result.index);
    } else {
      setSearchIndex(-1);
    }
  };

  const handleReplace = () => {
    if (!findText) return;
    const start = searchIndex;
    if (start !== -1) {
      const newMarkdown = markdown.substring(0, start) + replaceText + markdown.substring(start + findText.length);
      setMarkdown(newMarkdown);
      // We don't clear searchIndex here, handleFindNext or useEffect will handle it
      // Actually we should probably move to the next one
      setTimeout(handleFindNext, 0);
    } else {
      handleFindNext();
    }
  };

  const handleReplaceAll = () => {
    if (!findText || matchCount === 0) return;

    if (window.confirm(`Are you sure you want to replace all ${matchCount} occurrence(s) of "${findText}"?`)) {
      const flags = isCaseSensitive ? 'g' : 'gi';
      let pattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (isWholeWord) pattern = `\\b${pattern}\\b`;

      const regex = new RegExp(pattern, flags);
      const newMarkdown = markdown.replace(regex, replaceText);
      setMarkdown(newMarkdown);

      alert(`Successfully replaced ${matchCount} occurrence(s).`);
      setSearchIndex(-1);
    }
  };

  const clearEditor = () => {
    if (window.confirm("Are you sure you want to clear your document? This cannot be undone.")) {
      setMarkdown("");
    }
  };

  const takeSnapshot = async () => {
    await addSnapshot(markdown);
    alert("Snapshot saved successfully.");
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() && chatAttachedImages.length === 0) return;

    // Ensure RAG index is current for this query
    ragService.indexDocument(markdown);

    const userMessage: ChatMessage = {
      role: 'user',
      parts: [{ text: aiPrompt }],
      images: chatAttachedImages.length > 0 ? chatAttachedImages : undefined
    };
    const historyWithUser = [...chatHistory, userMessage];
    setChatHistory(historyWithUser);
    setAiPrompt('');
    setChatAttachedImages([]);
    setIsGeneratingAi(true);
    setAiResult(null);

    // Add placeholder for streaming response
    setChatHistory(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

    // Get cursor context for better RAG awareness
    const cursorContext = editorRef.current?.getCursorContext() || "";

    try {
      let fullResponse = "";
      const response = await chatWithAI(
        historyWithUser,
        markdown,
        {
          personalInstructions: aiPersonalInstructions,
          model: selectedModel,
          provider,
          apiKeys,
          providerConfigs,
          onChunk: (chunk) => {
            fullResponse += chunk;
            setChatHistory(prev => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'model') {
                next[next.length - 1] = { ...last, parts: [{ text: fullResponse }] };
              }
              return next;
            });
          },
          cursorContext
        }
      );
      setAiResult(response);
    } catch (error) {
      console.error("AI Generation failed:", error);
      const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
      setChatHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'model', parts: [{ text: errorMessage }] };
        return next;
      });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const applyAiResult = (method: 'append' | 'insert' | 'replace' | 'suggest') => {
    if (!aiResult) return;

    switch (method) {
      case 'append':
        const prefix = markdown.trim() ? "\n\n" : "";
        editorRef.current?.appendMarkdown(prefix + aiResult);
        break;
      case 'insert':
        editorRef.current?.replaceSelectionWithMarkdown(aiResult);
        break;
      case 'replace':
        editorRef.current?.replaceSelectionWithMarkdown(aiResult);
        break;
      case 'suggest':
        editorRef.current?.replaceSelectionWithMarkdown(`\n\n> **Suggested Edit:**\n> ${aiResult.split('\n').join('\n> ')}\n\n`);
        break;
    }

    setAiResult(null);
    setAiAssistant(false);
  };

  useEffect(() => {
    if (showAiAssistant && provider === 'ollama') {
      setOllamaStatus(prev => ({ ...prev, loading: true }));
      checkOllamaConnection(selectedModel).then(res => {
        setOllamaStatus({
          loading: false,
          connected: res.success,
          model: res.model || '',
          error: res.error
        });
        if (res.allModels) {
          setAvailableModels(res.allModels);
          if (res.model && res.model !== selectedModel) {
            setSelectedModel(res.model);
          }
        }
      });
    } else if (showAiAssistant && provider !== 'ollama') {
      // For OpenAI/Anthropic, we don't check connection same way
      setOllamaStatus({
        loading: false,
        connected: true, // Assume connected if key is present
        model: selectedModel,
      });

      if (provider === 'openai') setAvailableModels(['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']);
      if (provider === 'anthropic') setAvailableModels(['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']);
    }
  }, [showAiAssistant, selectedModel, provider]);

  const toolbarButtons = [
    { icon: Heading1, label: 'Heading 1', action: () => editorRef.current?.handleFormat('h1') },
    { icon: Heading2, label: 'Heading 2', action: () => editorRef.current?.handleFormat('h2') },
    { icon: Heading3, label: 'Heading 3', action: () => editorRef.current?.handleFormat('h3') },
    { icon: Bold, label: 'Bold', action: () => editorRef.current?.handleFormat('bold') },
    { icon: Italic, label: 'Italic', action: () => editorRef.current?.handleFormat('italic') },
    { icon: Code, label: 'Code', action: () => editorRef.current?.handleFormat('code') },
    { icon: Quote, label: 'Quote', action: () => editorRef.current?.handleFormat('quote') },
    { icon: List, label: 'Unordered List', action: () => insertText('- ') },
    { icon: ListOrdered, label: 'Ordered List', action: () => insertText('1. ') },
    {
      icon: ImageIcon, label: 'Image', action: () => {
        const choice = window.confirm("Click OK to Upload an image, or Cancel to provide a URL.");
        if (choice) {
          fileInputRef.current?.click();
        } else {
          const url = window.prompt("Enter Image URL:");
          if (url) {
            editorRef.current?.insertImage(url, "Image Alternative Text");
          }
        }
      }
    },
  ];

  const wordCount = markdown.split(/\s+/).filter(Boolean).length;
  const charCount = markdown.length;
  const readingTime = Math.ceil(wordCount / 200); // Avg 200 wpm
  const goalProgress = wordGoal > 0 ? Math.min((wordCount / wordGoal) * 100, 100) : 0;

  return (
    <div
      dir={direction}
      className={cn(
        "min-h-screen bg-minimal-bg text-minimal-text font-sans flex flex-col selection:bg-minimal-accent/20 transition-colors duration-500",
        ""
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleImageUpload}
      />
      <input
        type="file"
        ref={importFileInputRef}
        className="hidden"
        accept=".docx,.html,.htm,.md,.markdown,.txt"
        onChange={handleFileImport}
      />
      {/* Header / Toolbar - Removed as requested */}

      {/* Mobile Menu Sidebar */}
      <AnimatePresence>
        {showMobileMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenu(false)}
              className="fixed inset-0 bg-zinc-950/20 backdrop-blur-sm z-[80]"
            />
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="fixed top-0 start-0 bottom-0 w-[280px] bg-minimal-bg border-e border-minimal-border z-[90] shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-minimal-border flex justify-between items-center bg-minimal-sidebar">
                <span className="text-xs font-bold text-minimal-muted uppercase tracking-widest">Navigation</span>
                <button onClick={() => setMobileMenu(false)} className="p-1 hover:bg-minimal-border rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <button
                  onClick={() => { setAiAssistant(true); setMobileMenu(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-minimal-accent text-white shadow-lg"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-bold">AI Assistant</span>
                </button>

                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-bold text-minimal-muted uppercase tracking-wider mb-2">Actions</p>
                  <button
                    onClick={() => { clearEditor(); setMobileMenu(false); }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-minimal-border text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Clear Document</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* AI Assistant Sidebar / Overlay */}
      <AnimatePresence>
        {showAiAssistant && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAiAssistant(false)}
              className="fixed inset-0 bg-zinc-950/20 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="fixed top-0 end-0 bottom-0 w-full md:w-[400px] bg-minimal-bg border-s border-minimal-border z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-4 md:p-6 border-b border-minimal-border flex justify-between items-center bg-minimal-sidebar">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-minimal-accent flex items-center justify-center text-white shadow-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-minimal-text uppercase tracking-widest leading-none">AI Assistant</h2>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        ollamaStatus.loading ? "bg-minimal-muted animate-pulse" :
                          ollamaStatus.connected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-red-500"
                      )} />
                      <p className="text-[9px] text-minimal-muted font-bold uppercase tracking-tight">
                        {ollamaStatus.loading ? "Verifying..." : ollamaStatus.connected ? `Live: ${ollamaStatus.model}` : "Server Offline"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSavedConversations(true)}
                    className="p-2 hover:bg-minimal-border rounded-full text-minimal-muted transition-colors"
                    title="Saved Conversations"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>
                  <button
                    onClick={saveCurrentChat}
                    disabled={chatHistory.length === 0}
                    className="p-2 hover:bg-minimal-border rounded-full text-minimal-muted disabled:opacity-30 transition-colors"
                    title="Save Conversation"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setAiSettings(!showAiSettings)}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      showAiSettings ? "bg-minimal-accent/10 text-minimal-accent" : "hover:bg-minimal-border text-minimal-muted"
                    )}
                    title="AI Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setAiAssistant(false)}
                    className="p-2 hover:bg-minimal-border rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-minimal-muted" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <AnimatePresence>
                  {showAiSettings && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-b border-minimal-border bg-minimal-bg"
                    >
                      <div className="p-4 space-y-4">
                        {/* Provider Selection */}
                        <div className="space-y-2">
                          <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">AI Provider</h3>
                          <div className="grid grid-cols-3 gap-2">
                            {(['ollama', 'openai', 'anthropic'] as const).map(p => (
                              <button
                                key={p}
                                onClick={() => {
                                  setProvider(p);
                                  if (p === 'openai') setSelectedModel('gpt-4o');
                                  if (p === 'anthropic') setSelectedModel('claude-3-5-sonnet-20240620');
                                  if (p === 'ollama') setSelectedModel('mistral');
                                }}
                                className={cn(
                                  "py-2 px-1 rounded-xl border text-[9px] font-bold uppercase transition-all",
                                  provider === p
                                    ? "bg-minimal-accent border-minimal-accent text-white shadow-lg shadow-minimal-accent/20"
                                    : "bg-minimal-sidebar border-minimal-border text-minimal-muted hover:border-minimal-accent/30"
                                )}
                              >
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Provider Specific Settings */}
                        {provider === 'ollama' && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">Ollama Host (Proxy)</h3>
                            <input
                              type="text"
                              value={providerConfigs.ollama.host || '/api/ai'}
                              onChange={(e) => setOllamaHost(e.target.value)}
                              placeholder="/api/ai"
                              className="w-full bg-minimal-sidebar border border-minimal-border rounded-xl p-3 text-xs font-medium text-minimal-text outline-none focus:border-minimal-accent transition-all"
                            />
                          </div>
                        )}

                        {provider === 'openai' && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">OpenAI API Key</h3>
                            <input
                              type="password"
                              value={apiKeys.openai}
                              onChange={(e) => setApiKey('openai', e.target.value)}
                              placeholder="sk-..."
                              className="w-full bg-minimal-sidebar border border-minimal-border rounded-xl p-3 text-xs font-medium text-minimal-text outline-none focus:border-minimal-accent transition-all"
                            />
                          </div>
                        )}

                        {provider === 'anthropic' && (
                          <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                            <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">Anthropic API Key</h3>
                            <input
                              type="password"
                              value={apiKeys.anthropic}
                              onChange={(e) => setApiKey('anthropic', e.target.value)}
                              placeholder="x-api-key..."
                              className="w-full bg-minimal-sidebar border border-minimal-border rounded-xl p-3 text-xs font-medium text-minimal-text outline-none focus:border-minimal-accent transition-all"
                            />
                          </div>
                        )}

                        {/* Model Selection */}
                        <div className="space-y-2">
                          <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">AI Model Selection</h3>
                          <div className="relative group/model">
                            <select
                              value={selectedModel}
                              onChange={(e) => setSelectedModel(e.target.value)}
                              className="w-full bg-minimal-sidebar border border-minimal-border rounded-xl p-3 text-xs font-bold text-minimal-text outline-none focus:border-minimal-accent appearance-none cursor-pointer group-hover/model:border-minimal-accent/50 transition-all uppercase tracking-wide px-4"
                            >
                              {availableModels.length > 0 ? (
                                availableModels.map(model => (
                                  <option key={model} value={model}>{model}</option>
                                ))
                              ) : (
                                <option value={selectedModel}>{selectedModel} (Loading...)</option>
                              )}
                            </select>
                            <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-minimal-muted">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-minimal-border/50">
                          <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">Refinement Preferences</h3>
                          <button
                            onClick={() => setAiPersonalInstructions("")}
                            className="text-[9px] font-bold text-minimal-muted hover:text-red-500 transition-colors uppercase"
                          >
                            Reset
                          </button>
                        </div>
                        <div className="bg-minimal-accent/5 border border-minimal-accent/20 rounded-2xl p-4">
                          <p className="text-[10px] text-minimal-accent font-bold mb-2 uppercase tracking-wide">Listening Profile</p>
                          <textarea
                            value={aiPersonalInstructions}
                            onChange={(e) => setAiPersonalInstructions(e.target.value)}
                            placeholder="Specify your style preferences (e.g., 'Formal tone', 'Short paragraphs')..."
                            className="w-full h-24 bg-transparent border-none p-0 text-xs focus:ring-0 outline-none transition-all resize-none font-medium leading-relaxed text-minimal-text placeholder:text-minimal-muted/40"
                          />
                          <div className="mt-2 flex items-center gap-2 border-t border-minimal-accent/10 pt-2">
                            <Check className="w-2.5 h-2.5 text-minimal-accent" />
                            <span className="text-[9px] font-bold text-minimal-accent/70 uppercase">Applied to all generations</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-8" ref={chatScrollRef}>
                  {chatHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 py-12">
                      <div className="w-12 h-12 rounded-2xl bg-minimal-border flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-minimal-text" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-widest mb-1">Deep Intelligence</h3>
                        <p className="text-[10px] font-medium max-w-[200px] mx-auto">Ask Gemini to write, rewrite, or brainstorm with you.</p>
                      </div>
                    </div>
                  )}

                  {chatHistory.length > 0 && (
                    <section className="space-y-6">
                      <div className="flex items-center justify-between sticky top-0 bg-minimal-bg/80 backdrop-blur pb-2 z-10 border-b border-minimal-border/30 mb-4 px-1">
                        <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Deep context Thread</h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSavedConversations(true)}
                            className="text-[10px] font-bold text-minimal-muted hover:text-minimal-accent hover:bg-minimal-accent/10 px-2 py-1 rounded transition-all uppercase flex items-center gap-1.5"
                            title="Load Saved Conversations"
                          >
                            <History className="w-3 h-3" /> Library
                          </button>
                          <button
                            onClick={saveCurrentChat}
                            className="text-[10px] font-bold text-minimal-accent hover:bg-minimal-accent/10 px-2 py-1 rounded transition-colors uppercase flex items-center gap-1"
                          >
                            <Save className="w-3 h-3" /> Save
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm("Clear this conversation history?")) {
                                setChatHistory([]);
                                setAiResult(null);
                              }
                            }}
                            className="text-[10px] font-bold text-red-500 hover:bg-red-500/10 px-2 py-1 rounded transition-colors uppercase"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <div className="space-y-6 pb-4">
                        {chatHistory.map((msg, idx) => (
                          <div key={idx} className={cn(
                            "flex flex-col gap-2 max-w-[90%] group/msg",
                            msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                          )}>
                            <div className={cn(
                              "px-4 py-3 rounded-2xl text-xs font-medium leading-relaxed relative",
                              msg.role === 'user'
                                ? "bg-minimal-accent text-white rounded-tr-none shadow-md shadow-minimal-accent/20"
                                : "bg-minimal-sidebar border border-minimal-border text-minimal-text rounded-tl-none"
                            )}>
                              {msg.images && msg.images.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {msg.images.map((img, i) => (
                                    <img
                                      key={i}
                                      src={img}
                                      alt="uploaded"
                                      className="max-w-full md:max-w-[200px] max-h-[200px] rounded-lg border border-white/20 shadow-sm object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ))}
                                </div>
                              )}
                              <div className="markdown-body">
                                <Markdown>{msg.parts[0].text}</Markdown>
                              </div>

                              {msg.role === 'model' && (
                                <div className="absolute top-0 right-0 -mr-2 -mt-2 flex gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => {
                                      setAiResult(msg.parts[0].text);
                                      setAiAssistant(true); // Open the insertion helper
                                    }}
                                    className="p-1.5 bg-emerald-500 text-white rounded-lg shadow-lg hover:scale-110 transition-transform"
                                    title="Accept / Use this text"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAiPrompt(`Revise this section: "${msg.parts[0].text.substring(0, 100)}..." \n\nMy Feedback: `);
                                      chatInputRef.current?.focus();
                                    }}
                                    className="p-1.5 bg-blue-500 text-white rounded-lg shadow-lg hover:scale-110 transition-transform"
                                    title="Revise / Feedback"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setChatHistory(prev => prev.filter((_, i) => i !== idx));
                                    }}
                                    className="p-1.5 bg-red-500 text-white rounded-lg shadow-lg hover:scale-110 transition-transform"
                                    title="Dismiss"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <span className="text-[8px] font-bold text-minimal-muted uppercase tracking-widest opacity-60 px-1">
                              {msg.role === 'user' ? 'Direct Input' : 'Ink & Quill Intelligence'}
                            </span>
                          </div>
                        ))}
                        {isGeneratingAi && (
                          <div className="flex flex-col gap-2 items-start mr-auto max-w-[90%]">
                            <div className="px-5 py-3 bg-minimal-sidebar border border-minimal-border rounded-2xl rounded-tl-none flex items-center gap-1.5">
                              {[0, 1, 2].map(i => (
                                <motion.div
                                  key={i}
                                  animate={{ y: [0, -3, 0], opacity: [0.3, 1, 0.3] }}
                                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                                  className="w-1.5 h-1.5 bg-minimal-accent rounded-full"
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  )}
                </div>

                <div className="p-4 md:p-6 bg-minimal-sidebar border-t border-minimal-border">
                  <section>
                    {chatAttachedImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3 px-1">
                        {chatAttachedImages.map((img, idx) => (
                          <div key={idx} className="relative group/img">
                            <img
                              src={img}
                              alt="attached"
                              className="w-12 h-12 rounded-lg object-cover border border-minimal-border shadow-sm"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              onClick={() => setChatAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md opacity-0 group-hover/img:opacity-100 transition-opacity"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1 mb-2 px-1">
                      <button onClick={() => formatChatInput('bold')} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted transition-colors" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                      <button onClick={() => formatChatInput('italic')} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted transition-colors" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                      <button onClick={() => formatChatInput('list')} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted transition-colors" title="Bullet List"><List className="w-3.5 h-3.5" /></button>
                      <div className="w-px h-3 bg-minimal-border mx-1" />
                      <button onClick={() => chatImageInputRef.current?.click()} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted transition-colors" title="Attach Image"><ImagePlus className="w-3.5 h-3.5" /></button>
                      <input
                        type="file"
                        ref={chatImageInputRef}
                        className="hidden"
                        accept="image/*"
                        multiple
                        onChange={handleChatImageUpload}
                      />
                      {chatHistory.length > 0 && (
                        <div className="ml-auto flex items-center gap-1">
                          <button onClick={() => exportChat(chatHistory, 'json')} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted transition-colors" title="Export as JSON"><Download className="w-3.5 h-3.5" /></button>
                          <button onClick={() => exportChat(chatHistory, 'md')} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted transition-colors" title="Export as Markdown"><ImageIcon className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>

                    <div className="relative group">
                      <textarea
                        ref={chatInputRef}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            handleAiGenerate();
                          }
                        }}
                        placeholder={chatHistory.length > 0 ? "Ask a follow up..." : "How can I help you write today?"}
                        className="w-full h-28 bg-minimal-bg border border-minimal-border rounded-2xl p-4 text-xs focus:ring-4 focus:ring-minimal-accent/5 focus:border-minimal-accent outline-none transition-all resize-none font-medium leading-relaxed pr-12 group-hover:border-minimal-accent/50"
                      />
                      <button
                        onClick={handleAiGenerate}
                        disabled={isGeneratingAi || !aiPrompt.trim()}
                        className="absolute bottom-3 right-3 p-3 bg-minimal-accent text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                      <div className="absolute top-2 right-3">
                        <span className="text-[9px] font-bold text-minimal-muted/40 uppercase tracking-tighter">CMD+Enter</span>
                      </div>
                    </div>

                    {chatHistory.length === 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button onClick={() => setAiPrompt("Brainstorm 5 topics for ")} className="p-2 border border-minimal-border rounded-xl text-[10px] font-bold uppercase tracking-wider text-minimal-muted hover:bg-minimal-bg hover:text-minimal-accent transition-all">Quick Brainstorm</button>
                        <button onClick={() => setAiPrompt("Draft a professional ")} className="p-2 border border-minimal-border rounded-xl text-[10px] font-bold uppercase tracking-wider text-minimal-muted hover:bg-minimal-bg hover:text-minimal-accent transition-all">Quick Draft</button>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Saved Conversations Overlay */}
      <AnimatePresence>
        {showSavedConversations && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSavedConversations(false)}
              className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[110]"
            />
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="fixed inset-x-4 top-20 bottom-20 md:inset-x-auto md:right-8 md:top-24 md:bottom-24 md:w-[350px] bg-minimal-bg border border-minimal-border rounded-3xl z-[120] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-minimal-border flex justify-between items-center bg-minimal-sidebar px-6">
                <div>
                  <h3 className="text-xs font-bold text-minimal-text uppercase tracking-widest">Saved Chats</h3>
                  <p className="text-[9px] font-bold text-minimal-muted uppercase tracking-tighter mt-0.5">{savedChats.length} Conversations</p>
                </div>
                <button onClick={() => setSavedConversations(false)} className="p-2 hover:bg-minimal-border rounded-full transition-colors">
                  <X className="w-4 h-4 text-minimal-muted" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {savedChats.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30 py-12">
                    <FolderOpen className="w-8 h-8 mb-2" />
                    <p className="text-[10px] font-bold uppercase tracking-widest">No saved chats</p>
                  </div>
                ) : (
                  savedChats.map(chat => (
                    <div
                      key={chat.id}
                      className="group/item bg-minimal-sidebar hover:bg-minimal-bg border border-minimal-border hover:border-minimal-accent/30 rounded-2xl p-4 transition-all cursor-pointer shadow-sm hover:shadow-md"
                    >
                      <div className="flex justify-between items-start mb-2" onClick={() => loadChat(chat)}>
                        <h4 className="text-[11px] font-bold text-minimal-text line-clamp-1">{chat.name}</h4>
                        <span className="text-[8px] font-bold text-minimal-muted whitespace-nowrap ml-2">
                          {new Date(chat.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[10px] text-minimal-muted line-clamp-2 mb-3" onClick={() => loadChat(chat)}>
                        {chat.history[chat.history.length - 1]?.parts[0].text.substring(0, 80)}...
                      </p>
                      <div className="flex items-center gap-2 pt-3 border-t border-minimal-border/50">
                        {chat.documentSnapshot !== undefined && (
                          <button
                            onClick={() => {
                              if (window.confirm("This will overwrite your current document. Are you sure?")) {
                                setMarkdown(chat.documentSnapshot!);
                                setSavedConversations(false);
                              }
                            }}
                            className="text-[9px] font-bold text-minimal-accent hover:underline uppercase tracking-tight flex items-center gap-1"
                          >
                            <FileText className="w-2.5 h-2.5" /> Restore Doc
                          </button>
                        )}
                        <button
                          onClick={() => exportChat(chat.history, 'md')}
                          className="ml-auto text-[9px] font-bold text-minimal-accent hover:underline uppercase tracking-tight flex items-center gap-1"
                        >
                          <Download className="w-2.5 h-2.5" /> Export
                        </button>
                        <button
                          onClick={() => deleteSavedChat(chat.id)}
                          className="text-[9px] font-bold text-red-400 hover:text-red-600 uppercase tracking-tight flex items-center gap-1"
                        >
                          <Trash2 className="w-2.5 h-2.5" /> Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating AI Review Panel */}
      <AnimatePresence>
        {aiResult && (
          <motion.div
            initial={{ y: 100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 100, opacity: 0, x: '-50%' }}
            className="fixed bottom-12 md:bottom-16 left-1/2 z-[100] w-[95%] max-w-[600px] bg-minimal-bg border border-minimal-border rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden flex flex-col max-h-[70vh]"
          >
            <div className="px-6 py-4 border-b border-minimal-border flex items-center justify-between bg-minimal-sidebar/50">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-minimal-accent/10 flex items-center justify-center text-minimal-accent">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <h3 className="text-[11px] font-bold text-minimal-text uppercase tracking-widest">Intelligent Draft Review</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAiResult(null)}
                  className="px-3 py-1.5 text-[10px] font-bold text-minimal-muted hover:text-red-500 hover:bg-red-50 rounded-full transition-all uppercase"
                >
                  Discard
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-minimal-bg custom-scrollbar">
              <div className="prose prose-sm max-w-none font-medium text-minimal-text leading-relaxed prose-headings:text-minimal-accent prose-headings:font-bold prose-p:mb-4">
                <Markdown>{aiResult}</Markdown>
              </div>
            </div>

            <div className="p-4 bg-minimal-sidebar border-t border-minimal-border">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button
                  onClick={() => applyAiResult('replace')}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 bg-minimal-accent text-white rounded-2xl text-[10px] font-bold shadow-lg shadow-minimal-accent/20 hover:scale-[1.02] active:scale-95 transition-all group"
                >
                  <Check className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span>REPLACE</span>
                </button>
                <button
                  onClick={() => applyAiResult('insert')}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 bg-minimal-bg border border-minimal-border text-minimal-text rounded-2xl text-[10px] font-bold hover:bg-minimal-sidebar hover:border-minimal-accent/30 transition-all group"
                >
                  <Plus className="w-4 h-4 text-minimal-accent group-hover:rotate-90 transition-transform" />
                  <span>INSERT</span>
                </button>
                <button
                  onClick={() => applyAiResult('append')}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 bg-minimal-bg border border-minimal-border text-minimal-text rounded-2xl text-[10px] font-bold hover:bg-minimal-sidebar hover:border-minimal-accent/30 transition-all group"
                >
                  <ChevronDown className="w-4 h-4 text-minimal-accent group-hover:translate-y-0.5 transition-transform" />
                  <span>APPEND</span>
                </button>
                <button
                  onClick={() => applyAiResult('suggest')}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 bg-minimal-bg border border-minimal-border text-minimal-text rounded-2xl text-[10px] font-bold hover:bg-minimal-sidebar hover:border-minimal-accent/30 transition-all group"
                >
                  <ArrowRightLeft className="w-4 h-4 text-minimal-accent group-hover:rotate-180 transition-transform duration-500" />
                  <span>SUGGEST</span>
                </button>
              </div>
              <p className="text-[9px] text-center text-minimal-muted/60 mt-3 font-medium uppercase tracking-tight">Select desired integration method above to update your document</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className={cn(
        "flex-1 flex overflow-hidden bg-minimal-sidebar transition-all duration-1000",
        "pt-0"
      )}>
        {!isMobile && (
          <div className="fixed top-8 right-8 z-50 flex flex-col gap-3">
            {/* Assistant Toggle */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05 }}
              onClick={() => setAiAssistant(!showAiAssistant)}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                showAiAssistant ? "bg-minimal-accent border-minimal-accent text-white" : "bg-minimal-bg/90 border-minimal-border text-minimal-muted"
              )}
              title="AI Assistant"
            >
              <Sparkles className="w-5 h-5" />
            </motion.button>

            {/* Search Toggle */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05 }}
              onClick={() => { setSearch(!showSearch); setSearchIndex(-1); }}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                showSearch ? "bg-minimal-accent border-minimal-accent text-white" : "bg-minimal-bg/90 border-minimal-border text-minimal-muted"
              )}
              title="Find & Replace"
            >
              <Search className="w-5 h-5" />
            </motion.button>

            <div className="h-px bg-minimal-border/30 mx-3 my-1" />

            {/* Typewriter toggle */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05 }}
              onClick={() => setTypewriter(!isTypewriter)}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                isTypewriter ? "bg-minimal-accent border-minimal-accent text-white" : "bg-minimal-bg/90 border-minimal-border text-minimal-muted"
              )}
              title="Typewriter Mode"
            >
              <Type className="w-5 h-5" />
            </motion.button>

            {/* Orientation toggle */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05 }}
              onClick={() => setDirection(prev => prev === 'ltr' ? 'rtl' : 'ltr')}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl bg-minimal-bg/90 border-minimal-border text-minimal-muted transition-all duration-300"
              )}
              title={`Switch to ${direction === 'ltr' ? 'RTL' : 'LTR'}`}
            >
              <Languages className="w-5 h-5" />
            </motion.button>

            {/* Daily Goal Toggle */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05 }}
              onClick={() => {
                const goal = window.prompt("Set your word count goal:", wordGoal.toString());
                if (goal !== null) {
                  const parsed = parseInt(goal);
                  setWordGoal(parsed || 0);
                  localStorage.setItem('ink-quill-goal', (parsed || 0).toString());
                }
              }}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                wordGoal > 0 ? "bg-minimal-accent border-minimal-accent text-white" : "bg-minimal-bg/90 border-minimal-border text-minimal-muted"
              )}
              title="Daily Word Goal"
            >
              <Target className="w-5 h-5" />
            </motion.button>

            <div className="h-px bg-minimal-border/30 mx-3 my-1" />

            {/* Wipe Document */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05, color: '#ef4444' }}
              onClick={clearEditor}
              className="p-3.5 bg-minimal-bg/90 backdrop-blur border border-minimal-border rounded-full shadow-2xl text-minimal-muted transition-all duration-300"
              title="Wipe Document"
            >
              <Trash2 className="w-5 h-5" />
            </motion.button>

            {/* Global Settings Toggle */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05 }}
              onClick={() => setSettings(!showSettings)}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                showSettings ? "bg-minimal-accent border-minimal-accent text-white" : "bg-minimal-bg/90 border-minimal-border text-minimal-muted"
              )}
              title="Global Settings"
            >
              <Settings className="w-5 h-5" />
            </motion.button>

            {/* Snapshots Button */}
            <div className="relative">
              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 0.5, x: 0 }}
                whileHover={{ opacity: 1, scale: 1.05 }}
                className="p-3.5 bg-minimal-bg/90 backdrop-blur border border-minimal-border rounded-full shadow-2xl text-minimal-muted transition-all duration-300"
                onClick={() => setShowSnapshots(!showSnapshots)} title="Document Snapshots"
              >
                <History className="w-5 h-5" />
              </motion.button>

              {showSnapshots && <div className="absolute right-full mr-4 top-0 flex flex-col gap-1 w-48 bg-minimal-bg border border-minimal-border rounded-2xl shadow-2xl p-2 z-[60]">
                <div className="px-3 py-1.5 border-b border-minimal-border flex items-center justify-between">
                  <span className="text-[9px] font-bold text-minimal-muted uppercase tracking-widest">Snapshots</span>
                  <button onClick={takeSnapshot} className="p-1 hover:bg-minimal-accent/10 rounded-lg group/plus">
                    <Plus className="w-3 h-3 text-minimal-accent group-hover/plus:rotate-90 transition-transform" />
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto p-1 py-1.5 space-y-1">
                  {snapshots.length === 0 ? (
                    <p className="text-[9px] text-center text-minimal-muted/50 py-4 italic font-medium">No snapshots yet</p>
                  ) : (
                    snapshots.map(s => (
                      <div
                        key={s.id}
                        onClick={() => {
                          if (window.confirm("Restore this version? Your current work will be overwritten.")) {
                            setMarkdown(s.content);
                          }
                        }}
                        className="w-full text-left p-2 hover:bg-minimal-sidebar rounded-xl transition-all border border-transparent hover:border-minimal-border group/s cursor-pointer"
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[10px] font-bold text-minimal-text">{new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSnapshots(prev => prev.filter(snap => snap.id !== s.id));
                            }}
                            className="opacity-0 group-hover/s:opacity-100 p-1 hover:text-red-500 transition-all font-bold"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <p className="text-[8px] text-minimal-muted truncate">{s.content.substring(0, 40)}...</p>
                      </div>
                    ))
                  )}
                </div>
              </div>}
            </div>
            {/* Import Button - Removed and combined into Export Menu */}
            {/* Export Menu */}
            <div className="relative">
              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 0.5, x: 0 }}
                whileHover={{ opacity: 1, scale: 1.05 }}
                className="p-3.5 bg-minimal-bg/90 backdrop-blur border border-minimal-border rounded-full shadow-2xl text-minimal-muted transition-all duration-300"
                onClick={() => setShowFileActions(!showFileActions)} title="File Actions (Import/Export)"
              >
                <Download className="w-5 h-5" />
              </motion.button>

              {showFileActions && <div className="absolute right-full mr-4 bottom-0 flex flex-col gap-1 w-56 bg-minimal-bg border border-minimal-border rounded-2xl shadow-2xl p-2 z-[60]">
                <div className="px-3 py-1.5 border-b border-minimal-border">
                  <span className="text-[9px] font-bold text-minimal-muted uppercase tracking-widest">File Actions</span>
                </div>
                <div className="p-1 space-y-1">
                  {/* Import Section */}
                  <button
                    onClick={() => importFileInputRef.current?.click()}
                    className="w-full text-left p-2.5 hover:bg-minimal-accent/5 rounded-xl transition-all flex items-center gap-3 group/item"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-500 group-hover/item:bg-emerald-500 group-hover/item:text-white transition-colors">
                      <Upload className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-minimal-text">Import File</p>
                      <p className="text-[9px] text-minimal-muted font-medium">DOCX, HTML, Markdown</p>
                    </div>
                  </button>

                  <div className="h-px bg-minimal-border/30 my-1 mx-2" />
                  <p className="px-3 py-1 text-[8px] font-bold text-minimal-muted uppercase tracking-wider">Export As</p>
                  <button
                    onClick={async () => {
                      const editorElem = document.querySelector('.ProseMirror') as HTMLElement;
                      if (editorElem) {
                        await exportToPDF(editorElem, 'Ink-Quill-Doc');
                      }
                    }}
                    className="w-full text-left p-2.5 hover:bg-minimal-accent/5 rounded-xl transition-all flex items-center gap-3 group/item"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-500 group-hover/item:bg-red-500 group-hover/item:text-white transition-colors">
                      <FileText className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-minimal-text">PDF Document</span>
                  </button>
                  <button
                    onClick={() => {
                      const html = editorRef.current?.getHtml();
                      if (html) exportToHTML(html, 'Ink-Quill-Doc');
                    }}
                    className="w-full text-left p-2.5 hover:bg-minimal-accent/5 rounded-xl transition-all flex items-center gap-3 group/item"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-500 group-hover/item:bg-blue-500 group-hover/item:text-white transition-colors">
                      <Code className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-minimal-text">HTML Page</span>
                  </button>
                  <button
                    onClick={() => exportToMarkdown(markdown, 'Ink-Quill-Doc')}
                    className="w-full text-left p-2.5 hover:bg-minimal-accent/5 rounded-xl transition-all flex items-center gap-3 group/item"
                  >
                    <div className="w-8 h-8 rounded-lg bg-minimal-border flex items-center justify-center text-minimal-muted group-hover/item:bg-minimal-muted group-hover/item:text-minimal-bg transition-colors">
                      <Save className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-minimal-text">Markdown</span>
                  </button>
                  <button
                    onClick={async () => {
                      const doc = editorRef.current?.getDoc();
                      if (doc) await exportToDOCX(doc, 'Ink-Quill-Doc');
                    }}
                    className="w-full text-left p-2.5 hover:bg-minimal-accent/5 rounded-xl transition-all flex items-center gap-3 group/item"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 group-hover/item:bg-blue-600 group-hover/item:text-white transition-colors">
                      <FileText className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-minimal-text">Word Document (DOCX)</span>
                  </button>
                </div>
              </div>}
            </div>
          </div>
        )}
        <div className={cn(
          "flex-1 relative flex flex-col transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]",
          "max-w-4xl mx-auto border-minimal-border",
          "bg-minimal-bg border-s border-e shadow-none"
        )}>
          {/* Find and Replace Bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="absolute top-4 right-8 z-30 bg-minimal-bg border border-minimal-border rounded-xl shadow-xl p-3 flex flex-col gap-2 w-[360px]"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-minimal-sidebar rounded-lg flex items-center px-3 border border-minimal-border focus-within:border-minimal-accent transition-colors">
                    <Search className="w-3.5 h-3.5 text-minimal-muted mr-2" />
                    <input
                      type="text"
                      placeholder="Find"
                      value={findText}
                      onChange={(e) => {
                        setFindText(e.target.value);
                        setSearchIndex(-1);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleFindNext()}
                      className="bg-transparent border-none outline-none text-[13px] py-1.5 w-full font-medium"
                      autoFocus
                    />
                    {findText && (
                      <div className="text-[10px] font-bold text-minimal-accent px-1.5 py-0.5 bg-minimal-accent/10 rounded mr-1">
                        {matchCount > 0 ? `${currentMatchIndex || '-'} / ${matchCount}` : '0 / 0'}
                      </div>
                    )}
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => {
                          setIsCaseSensitive(!isCaseSensitive);
                          setSearchIndex(-1);
                        }}
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors",
                          isCaseSensitive ? "bg-minimal-accent text-white" : "text-minimal-muted hover:bg-minimal-border"
                        )}
                        title="Match Case"
                      >
                        Aa
                      </button>
                      <button
                        onClick={() => {
                          setIsWholeWord(!isWholeWord);
                          setSearchIndex(-1);
                        }}
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors border",
                          isWholeWord ? "bg-minimal-accent text-white border-minimal-accent" : "text-minimal-muted hover:bg-minimal-border border-minimal-border"
                        )}
                        title="Match Whole Word"
                      >
                        W
                      </button>
                      <button
                        onClick={() => {
                          setIsSemantic(!isSemantic);
                          setSearchIndex(-1);
                        }}
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded transition-all flex items-center gap-1",
                          isSemantic ? "bg-minimal-accent text-white" : "text-minimal-muted hover:bg-minimal-border border border-minimal-border"
                        )}
                        title="Semantic Search (RAG)"
                      >
                        <Zap className={cn("w-2.5 h-2.5", isSemantic ? "fill-current" : "")} />
                        Brain
                      </button>
                    </div>
                  </div>
                  {isSemantic && findText && (
                    <div className="flex flex-col gap-1 px-1">
                      <div className="flex justify-between items-center text-[9px] font-bold text-minimal-muted uppercase tracking-wider">
                        <span>Semantic Relevance</span>
                        <span>{matchCount > 0 ? "Matches Available" : "No Context Found"}</span>
                      </div>
                      <div className="h-1 bg-minimal-sidebar rounded-full overflow-hidden">
                         <div 
                           className="h-full bg-minimal-accent transition-all duration-500" 
                           style={{ width: matchCount > 0 ? '100%' : '0%' }}
                         />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <button onClick={handleFindNext} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted" title="Find Next">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => setSearch(false)} className="p-1.5 hover:bg-minimal-border rounded text-minimal-muted">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-minimal-sidebar rounded-lg flex items-center px-3 border border-minimal-border focus-within:border-minimal-accent transition-colors">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-minimal-muted me-2" />
                    <input
                      type="text"
                      placeholder="Replace"
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      className="bg-transparent border-none outline-none text-[13px] py-1.5 w-full font-medium"
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={handleReplace}
                      className="px-2 py-1 bg-minimal-border hover:bg-minimal-muted/20 rounded text-[10px] font-bold text-minimal-text uppercase transition-colors"
                    >
                      Replace
                    </button>
                    <button
                      onClick={handleReplaceAll}
                      className="px-2 py-1 bg-minimal-accent/10 hover:bg-minimal-accent/20 rounded text-[10px] font-bold text-minimal-accent uppercase transition-colors"
                    >
                      All
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <ProseMirrorEditor
            ref={editorRef}
            value={markdown}
            onChange={setMarkdown}
            onKeyDown={handleKeyDown}
            isTypewriter={isTypewriter}
            direction={direction}
            personalInstructions={aiPersonalInstructions}
            selectedModel={selectedModel}
            provider={provider}
            apiKeys={apiKeys}
            providerConfigs={providerConfigs}
            onAiResult={(result) => {
              setAiResult(result);
              setAiAssistant(true);
            }}
            onAiStream={(chunk) => {
              setAiResult(prev => (prev || '') + chunk);
              setAiAssistant(true);
            }}
            onSearchMetadata={(count, current) => {
              if (isSemantic) {
                setMatchCount(count);
                // current is already synced since App controls currentMatchIndex for semantic
              }
            }}
            onImageUploadRequest={() => {
              const choice = window.confirm("Click OK to Upload an image, or Cancel to provide a URL.");
              if (choice) {
                fileInputRef.current?.click();
              } else {
                const url = window.prompt("Enter Image URL:");
                if (url) {
                  editorRef.current?.insertImage(url, "Image Alternative Text");
                }
              }
            }}
            searchQuery={showSearch ? findText : ''}
            searchOptions={{ isCaseSensitive, isWholeWord, isSemantic, searchIndex, currentMatchIndex }}
            collab={{
              enabled: true,
              docId: 'local-document',
              username: 'Writer'
            }}
            className="flex-1 overflow-y-auto"
          />
        </div>
      </main>

      {/* Mobile Toolbar Bottom Sheet */}
      <AnimatePresence>
        {isMobile && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 inset-x-0 bg-minimal-bg/90 backdrop-blur border-t border-minimal-border shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-[100] pb-safe"
          >
            <div className="flex items-center justify-around p-3 pb-6 md:pb-3">
              <button onClick={() => editorRef.current?.handleFormat('bold')} className="p-3 bg-minimal-sidebar rounded-xl text-minimal-muted hover:text-minimal-text transition-colors"><Bold className="w-5 h-5" /></button>
              <button onClick={() => editorRef.current?.handleFormat('italic')} className="p-3 bg-minimal-sidebar rounded-xl text-minimal-muted hover:text-minimal-text transition-colors"><Italic className="w-5 h-5" /></button>
              <button onClick={() => editorRef.current?.handleFormat('h2')} className="p-3 bg-minimal-sidebar rounded-xl text-minimal-muted hover:text-minimal-text transition-colors"><Heading2 className="w-5 h-5" /></button>
              <button onClick={() => insertText('[', '](url)')} className="p-3 bg-minimal-sidebar rounded-xl text-minimal-muted hover:text-minimal-text transition-colors"><LinkIcon className="w-5 h-5" /></button>
              <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-minimal-sidebar rounded-xl text-minimal-muted hover:text-minimal-text transition-colors"><ImageIcon className="w-5 h-5" /></button>
              <div className="w-px h-8 bg-minimal-border mx-1" />
              <button onClick={() => setAiAssistant(true)} className="p-3 bg-minimal-accent/10 rounded-xl text-minimal-accent transition-colors"><Sparkles className="w-5 h-5" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettings(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-minimal-bg border border-minimal-border rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-minimal-border flex items-center justify-between bg-minimal-sidebar/50">
                <h3 className="text-xs font-bold text-minimal-text uppercase tracking-widest">Global Settings</h3>
                <button onClick={() => setSettings(false)} className="p-2 hover:bg-minimal-border rounded-full transition-colors">
                  <X className="w-4 h-4 text-minimal-muted" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Theme Section */}
                <section className="space-y-3">
                  <h4 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Appearance</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {(['light', 'dark', 'system'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={cn(
                          "py-2 px-3 rounded-xl border text-[10px] font-bold uppercase transition-all",
                          theme === t
                            ? "bg-minimal-accent border-minimal-accent text-white shadow-lg shadow-minimal-accent/20"
                            : "bg-minimal-sidebar/50 border-minimal-border text-minimal-muted hover:border-minimal-accent/30"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Typography Section */}
                <section className="space-y-4">
                  <h4 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Typography</h4>

                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-minimal-muted uppercase">Font Family</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Sans Serif', value: 'Inter, sans-serif' },
                        { label: 'Serif', value: '"Merriweather", serif' },
                        { label: 'Mono', value: '"JetBrains Mono", monospace' },
                        { label: 'Elegant', value: '"EB Garamond", serif' },
                      ].map(f => (
                        <button
                          key={f.value}
                          onClick={() => setFontFamily(f.value)}
                          className={cn(
                            "py-2 px-3 rounded-xl border text-[10px] font-bold transition-all text-left",
                            fontFamily === f.value
                              ? "bg-minimal-accent/10 border-minimal-accent text-minimal-accent"
                              : "bg-minimal-sidebar/50 border-minimal-border text-minimal-muted hover:border-minimal-accent/30"
                          )}
                          style={{ fontFamily: f.value }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-minimal-muted uppercase">Size: {fontSize}px</label>
                      <input
                        type="range" min="12" max="24" step="1"
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-full accent-minimal-accent"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-minimal-muted uppercase">Spacing: {lineHeight}</label>
                      <input
                        type="range" min="1.2" max="2.4" step="0.1"
                        value={lineHeight}
                        onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                        className="w-full accent-minimal-accent"
                      />
                    </div>
                  </div>
                </section>

                {/* Layout Section */}
                <section className="space-y-3">
                  <h4 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Layout</h4>
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-minimal-muted uppercase">Content Width</label>
                    <div className="flex gap-2">
                      {['600px', '800px', '1000px', '100%'].map(w => (
                        <button
                          key={w}
                          onClick={() => setMaxWidth(w)}
                          className={cn(
                            "flex-1 py-2 rounded-xl border text-[10px] font-bold transition-all",
                            maxWidth === w
                              ? "bg-minimal-accent/10 border-minimal-accent text-minimal-accent"
                              : "bg-minimal-sidebar/50 border-minimal-border text-minimal-muted hover:border-minimal-accent/30"
                          )}
                        >
                          {w === '100%' ? 'Full' : w}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              <div className="p-4 bg-minimal-sidebar/30 border-t border-minimal-border text-center">
                <p className="text-[8px] font-bold text-minimal-muted uppercase tracking-[0.2em]">Ink & Quill v2.0.0 — Modern Minimalism</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Keyboard Shortcuts Help Dialog */}
      <AnimatePresence>
        {showShortcuts && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShortcuts(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-minimal-bg border border-minimal-border rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-minimal-border flex items-center justify-between bg-minimal-sidebar/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-minimal-accent/10 flex items-center justify-center text-minimal-accent">
                    <Keyboard className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-bold text-minimal-text uppercase tracking-widest">Keyboard Shortcuts</h3>
                </div>
                <button onClick={() => setShowShortcuts(false)} className="p-2 hover:bg-minimal-border rounded-full transition-colors">
                  <X className="w-4 h-4 text-minimal-muted" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Editor Formatting */}
                <section className="space-y-3">
                  <h4 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Formatting</h4>
                  <div className="space-y-1.5">
                    {[
                      { keys: 'Ctrl + B', desc: 'Bold' },
                      { keys: 'Ctrl + I', desc: 'Italic' },
                      { keys: 'Ctrl + K', desc: 'Insert Link' },
                      { keys: 'Ctrl + `', desc: 'Inline Code' },
                      { keys: 'Ctrl + Z', desc: 'Undo' },
                      { keys: 'Ctrl + Shift + Z', desc: 'Redo' },
                    ].map(s => (
                      <div key={s.keys} className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-minimal-sidebar/50 transition-colors">
                        <span className="text-xs font-medium text-minimal-text">{s.desc}</span>
                        <kbd className="text-[10px] font-bold text-minimal-accent bg-minimal-accent/10 border border-minimal-accent/20 px-2.5 py-1 rounded-lg tracking-wide">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Navigation & Modes */}
                <section className="space-y-3">
                  <h4 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Navigation & Modes</h4>
                  <div className="space-y-1.5">
                    {[
                      { keys: 'Ctrl + F', desc: 'Find & Replace' },
                      
                      { keys: 'Ctrl + Shift + T', desc: 'Toggle Typewriter Mode' },
                      { keys: 'Ctrl + /', desc: 'Show Shortcuts (this dialog)' },
                    ].map(s => (
                      <div key={s.keys + s.desc} className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-minimal-sidebar/50 transition-colors">
                        <span className="text-xs font-medium text-minimal-text">{s.desc}</span>
                        <kbd className="text-[10px] font-bold text-minimal-accent bg-minimal-accent/10 border border-minimal-accent/20 px-2.5 py-1 rounded-lg tracking-wide">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </section>

                {/* AI & Editor */}
                <section className="space-y-3">
                  <h4 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">AI & Commands</h4>
                  <div className="space-y-1.5">
                    {[
                      { keys: '/', desc: 'Slash Commands (in editor)' },
                      { keys: 'Ctrl + Enter', desc: 'Send AI Chat Message' },
                    ].map(s => (
                      <div key={s.keys + s.desc} className="flex items-center justify-between py-1.5 px-3 rounded-xl hover:bg-minimal-sidebar/50 transition-colors">
                        <span className="text-xs font-medium text-minimal-text">{s.desc}</span>
                        <kbd className="text-[10px] font-bold text-minimal-accent bg-minimal-accent/10 border border-minimal-accent/20 px-2.5 py-1 rounded-lg tracking-wide">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="p-4 bg-minimal-sidebar/30 border-t border-minimal-border text-center">
                <p className="text-[8px] font-bold text-minimal-muted uppercase tracking-[0.2em]">Press Ctrl + / to toggle this dialog</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer / Status */}
      <AnimatePresence mode="wait">
        <motion.footer
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className={cn(
            "fixed bottom-0 inset-x-0 h-9 md:h-11 border-t border-minimal-border z-50 px-4 md:px-6 flex items-center justify-between transition-all duration-500",
            "bg-minimal-bg/90 backdrop-blur-md text-minimal-muted select-none"
          )}
        >
          {/* Left Side: Stats */}
          <div className="flex gap-4 md:gap-8 items-center h-full">
            <div className="flex gap-4 md:gap-6">
              <div className="flex flex-col justify-center">
                <span className="text-[8px] font-bold opacity-40 leading-none mb-0.5">WORDS</span>
                <span className="text-[10px] font-mono font-bold text-minimal-text">{wordCount}</span>
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[8px] font-bold opacity-40 leading-none mb-0.5">CHARS</span>
                <span className="text-[10px] font-mono font-bold text-minimal-text">{charCount}</span>
              </div>
            </div>

            <div className="h-6 w-px bg-minimal-border hidden sm:block" />

            <div className="hidden sm:flex flex-col justify-center">
              <span className="text-[8px] font-bold opacity-40 leading-none mb-0.5">READ TIME</span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 opacity-60" />
                <span className="text-[10px] font-mono font-bold text-minimal-text">{readingTime} MIN</span>
              </div>
            </div>

            {wordGoal > 0 && (
              <>
                <div className="h-6 w-px bg-minimal-border hidden md:block" />
                <div className="flex flex-col justify-center">
                  <span className="text-[8px] font-bold opacity-40 leading-none mb-0.5">PROGRESS</span>
                  <div className="flex items-center gap-3">
                    <div className="w-16 md:w-32 h-1 bg-minimal-border rounded-full overflow-hidden hidden sm:block">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${goalProgress}%` }}
                        className={cn("h-full", goalProgress >= 100 ? "bg-emerald-500" : "bg-minimal-accent")}
                      />
                    </div>
                    <span className={cn(
                      "text-[10px] font-mono font-bold",
                      goalProgress >= 100 ? "text-emerald-500 underline underline-offset-2" : "text-minimal-accent"
                    )}>
                      {Math.round(goalProgress)}%
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Side: Status Indicators */}
          <div className="flex gap-4 md:gap-6 items-center">
            {/* AI Status Group */}
            <div className="flex gap-2 items-center">
              {/* Main Model Connection */}
              {ollamaStatus.connected && (
                <div 
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-sm border transition-all",
                    "bg-green-500/5 text-green-600 border-green-500/10"
                  )}
                  title={`AI Provider: ${provider.toUpperCase()} | Model: ${ollamaStatus.model}`}
                >
                  <Cpu className="w-3 h-3" />
                  <span className="text-[9px] font-bold tracking-widest">{ollamaStatus.model.toUpperCase()}</span>
                </div>
              )}

              {/* Embedding Model Status - High Priority UI */}
              <div className="flex items-center">
                {embeddingStatus === 'idle' && (
                  <button 
                    onClick={() => embeddingService.loadModel()}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-minimal-accent/10 text-minimal-accent border border-minimal-accent/20 hover:bg-minimal-accent text-[9px] hover:text-white font-bold tracking-widest transition-all group scale-100 hover:scale-105 active:scale-95"
                    title="Start Downloading Vector Embedding Model (@xenova/transformers)"
                  >
                    <Upload className="w-3 h-3 rotate-180" />
                    <span>LOAD VECTOR AI</span>
                  </button>
                )}
                {embeddingStatus === 'loading' && (
                  <div className="flex items-center gap-2 px-2 py-1 rounded-sm bg-yellow-500/5 text-yellow-600 border border-yellow-500/10">
                    <Activity className="w-3 h-3 animate-pulse" />
                    <span className="text-[9px] font-bold tracking-widest">{Math.round(embeddingProgress)}% SYNCING</span>
                    <div className="w-10 h-1 bg-yellow-500/10 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500 transition-all duration-300" style={{ width: `${embeddingProgress}%` }} />
                    </div>
                  </div>
                )}
                {embeddingStatus === 'ready' && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-emerald-500/5 text-emerald-600 border border-emerald-500/10 group cursor-help transition-all animate-in fade-in slide-in-from-right-1 duration-500" title="Local Vector Store Active">
                    <Database className="w-3 h-3" />
                    <span className="text-[9px] font-bold tracking-widest">VECTOR AI READY</span>
                  </div>
                )}
                {embeddingStatus === 'error' && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-sm bg-red-500/5 text-red-600 border border-red-500/10 hover:bg-red-500/10 transition-colors cursor-pointer" onClick={() => embeddingService.loadModel()}>
                    <X className="w-3 h-3" />
                    <span className="text-[9px] font-bold tracking-widest">LOAD ERROR - RETRY?</span>
                  </div>
                )}
              </div>
            </div>

            {/* System Info & Indexing Status */}
            <div className="flex items-center gap-4 text-[9px] font-mono font-bold tracking-[0.2em] opacity-40">
              <span className="hidden lg:inline border-r border-minimal-border pr-4">UTF-8</span>
              
              <div className="flex items-center gap-4">
                {isIndexing ? (
                  <div className="flex items-center gap-2 text-minimal-accent animate-pulse opacity-100 bg-minimal-accent/5 px-2 py-0.5 rounded border border-minimal-accent/10">
                    <Activity className="w-3 h-3" />
                    <span>INDEXING DOCUMENT...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {indexedChunks > 0 && (
                      <div className="flex items-center gap-2 group cursor-help" title={`${indexedChunks} document chunks and ${indexedEpisodes} conversation snapshots stored locally.`}>
                        <div className="flex items-center gap-1 text-minimal-text opacity-70">
                          <FileText className="w-3 h-3" />
                          <span>{indexedChunks} CHUNKS</span>
                        </div>
                        {indexedEpisodes > 0 && (
                          <div className="flex items-center gap-1 text-minimal-accent/60">
                            <History className="w-3 h-3" />
                            <span>{indexedEpisodes} MEMORIES</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 px-1.5 py-0.5 border border-minimal-muted/20 rounded hover:border-minimal-accent/40 transition-colors">
                <span>MD</span>
              </div>
            </div>
          </div>
        </motion.footer>
      </AnimatePresence>
    </div>
  );
}
