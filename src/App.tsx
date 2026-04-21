/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
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
  Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import ProseMirrorEditor, { EditorRef } from './components/ProseMirrorEditor';
import { generateContentFromPrompt, processAIAction, chatWithAI, checkOllamaConnection, type ChatMessage } from './services/aiService';

const DEFAULT_MARKDOWN = `# Welcome to Ink & Quill

Ink & Quill is a clean, distraction-free Markdown editor.

## Key Features
- **Real-time Preview**: See your changes as you type.
- **GFM Support**: Tables, task lists, and more.
- **Auto-save**: Your work is saved locally in your browser.
- **Focus Mode**: Minimize distractions and just write.

### Basic Syntax
1. **Bold**: \*\*text\*\* or __text__
2. *Italic*: \*text\* or _text_
3. [Links](https://google.com)
4. \`Inline code\`
5. > Blockquotes

\`\`\`javascript
// Code blocks
function hello() {
  console.log("Hello, world!");
}
\`\`\`

| Feature | Support |
| :--- | :--- |
| Tables | Yes |
| Lists | Yes |
| Focus | Perfect |

Enjoy your writing journey!
`;

export default function App() {
  const [markdown, setMarkdown] = useState<string>(() => {
    const saved = localStorage.getItem('ink-quill-doc');
    return saved !== null ? saved : DEFAULT_MARKDOWN;
  });
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [snapshots, setSnapshots] = useState<{ id: string; timestamp: number; content: string }[]>(() => {
    const saved = localStorage.getItem('ink-quill-snapshots');
    return saved ? JSON.parse(saved) : [];
  });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(true);
  const [isTypewriterMode, setIsTypewriterMode] = useState(false);
  const [isSuperZen, setIsSuperZen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(() => {
    return (localStorage.getItem('ink-quill-dir') as 'ltr' | 'rtl') || 'ltr';
  });
  const [aiPersonalInstructions, setAiPersonalInstructions] = useState<string>(() => {
    return localStorage.getItem('ink-quill-ai-prefs') || "";
  });
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem('ink-quill-ai-model') || 'mistral';
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<{ loading: boolean; connected: boolean; model: string; error?: string }>({
    loading: false,
    connected: false,
    model: ''
  });
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [chatAttachedImages, setChatAttachedImages] = useState<string[]>([]);
  const [savedChats, setSavedChats] = useState<{ id: string; name: string; history: ChatMessage[]; timestamp: number }[]>(() => {
    const saved = localStorage.getItem('ink-quill-saved-chats');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSavedConversations, setShowSavedConversations] = useState(false);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory]);
  const [wordGoal, setWordGoal] = useState<number>(() => {
    const saved = localStorage.getItem('ink-quill-goal');
    return saved ? parseInt(saved) : 0;
  });

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

  const handleChatImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
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
      timestamp: Date.now()
    };

    const updated = [newChat, ...savedChats];
    setSavedChats(updated);
    localStorage.setItem('ink-quill-saved-chats', JSON.stringify(updated));
    alert("Conversation saved successfully.");
  };

  const loadChat = (chat: any) => {
    setChatHistory(chat.history);
    setShowSavedConversations(false);
  };

  const deleteSavedChat = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this saved conversation?")) return;
    const updated = savedChats.filter(c => c.id !== id);
    setSavedChats(updated);
    localStorage.setItem('ink-quill-saved-chats', JSON.stringify(updated));
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
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    localStorage.setItem('ink-quill-doc', markdown);
  }, [markdown]);

  useEffect(() => {
    localStorage.setItem('ink-quill-history', JSON.stringify([]));
  }, []);

  useEffect(() => {
    if (wordGoal > 0) {
      localStorage.setItem('ink-quill-goal', wordGoal.toString());
    } else {
      localStorage.removeItem('ink-quill-goal');
    }
  }, [wordGoal]);

  useEffect(() => {
    localStorage.setItem('ink-quill-dir', direction);
  }, [direction]);

  useEffect(() => {
    localStorage.setItem('ink-quill-ai-prefs', aiPersonalInstructions);
  }, [aiPersonalInstructions]);

  useEffect(() => {
    localStorage.setItem('ink-quill-ai-model', selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem('ink-quill-snapshots', JSON.stringify(snapshots));
  }, [snapshots]);

  useEffect(() => {
    // Apply standard brand colors and font to CSS variables
    const root = document.documentElement;
    root.style.setProperty('--minimal-bg', '#ffffff');
    root.style.setProperty('--minimal-sidebar', '#fafafa');
    root.style.setProperty('--minimal-border', '#e8e8e8');
    root.style.setProperty('--minimal-text', '#2c3e50');
    root.style.setProperty('--minimal-muted', '#95a5a6');
    root.style.setProperty('--minimal-accent', '#3498db');
    root.style.setProperty('--minimal-font', '"Inter", sans-serif');
  }, []);

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
        setShowSearch(prev => !prev);
        if (!showSearch) {
          setSearchIndex(-1);
        }
      } else if (e.key === 't' && e.shiftKey) {
        e.preventDefault();
        setIsTypewriterMode(prev => !prev);
      } else if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        setIsFocusMode(prev => !prev);
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
      // currentMatchIndex will be updated by useEffect
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

  const takeSnapshot = () => {
    const newSnapshot = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      content: markdown
    };
    setSnapshots(prev => [newSnapshot, ...prev].slice(0, 5)); // Keep last 5
    alert("Snapshot saved successfully.");
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() && chatAttachedImages.length === 0) return;
    
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

    try {
      let fullResponse = "";
      const response = await chatWithAI(
        historyWithUser, 
        markdown, 
        aiPersonalInstructions, 
        selectedModel,
        (chunk) => {
          fullResponse += chunk;
          setChatHistory(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.role === 'model') {
              next[next.length - 1] = { ...last, parts: [{ text: fullResponse }] };
            }
            return next;
          });
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
    setShowAiAssistant(false);
  };

  useEffect(() => {
    if (showAiAssistant) {
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
    }
  }, [showAiAssistant, selectedModel]);

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
    { icon: Layout, label: 'Toggle Preview', action: () => setShowPreview(prev => !prev), active: showPreview },
    { icon: ImageIcon, label: 'Image', action: () => {
      const choice = window.confirm("Click OK to Upload an image, or Cancel to provide a URL.");
      if (choice) {
        fileInputRef.current?.click();
      } else {
        const url = window.prompt("Enter Image URL:");
        if (url) {
          editorRef.current?.insertImage(url, "Image Alternative Text");
        }
      }
    }},
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
        isFocusMode && "overflow-hidden"
      )}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={handleImageUpload} 
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
              onClick={() => setShowMobileMenu(false)}
              className="fixed inset-0 bg-zinc-950/20 backdrop-blur-sm z-[80]"
            />
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className="fixed top-0 start-0 bottom-0 w-[280px] bg-white border-e border-minimal-border z-[90] shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-minimal-border flex justify-between items-center bg-zinc-50">
                <span className="text-xs font-bold text-minimal-muted uppercase tracking-widest">Navigation</span>
                <button onClick={() => setShowMobileMenu(false)} className="p-1 hover:bg-zinc-200 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <button
                  onClick={() => { setShowAiAssistant(true); setShowMobileMenu(false); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-minimal-accent text-white shadow-lg"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm font-bold">AI Assistant</span>
                </button>
                
                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-bold text-minimal-muted uppercase tracking-wider mb-2">Actions</p>
                  <button
                    onClick={() => { clearEditor(); setShowMobileMenu(false); }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Clear Document</span>
                  </button>
                </div>
              </div>
              <div className="p-4 bg-zinc-50 border-t border-minimal-border">
                <button
                  onClick={() => { setIsFocusMode(true); setShowMobileMenu(false); }}
                  className="w-full py-2 bg-zinc-900 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  <FocusOn className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">Enter Zen Mode</span>
                </button>
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
              onClick={() => setShowAiAssistant(false)}
              className="fixed inset-0 bg-zinc-950/20 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="fixed top-0 end-0 bottom-0 w-full md:w-[400px] bg-white border-s border-minimal-border z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-4 md:p-6 border-b border-minimal-border flex justify-between items-center bg-zinc-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-minimal-accent flex items-center justify-center text-white shadow-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-minimal-text uppercase tracking-widest leading-none">AI Assistant</h2>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        ollamaStatus.loading ? "bg-zinc-300 animate-pulse" : 
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
                    onClick={() => setShowSavedConversations(true)}
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
                    onClick={() => setShowAiSettings(!showAiSettings)}
                    className={cn(
                      "p-2 rounded-full transition-all",
                      showAiSettings ? "bg-minimal-accent/10 text-minimal-accent" : "hover:bg-minimal-border text-minimal-muted"
                    )}
                    title="AI Settings"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setShowAiAssistant(false)}
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
                      className="overflow-hidden border-b border-minimal-border bg-white"
                    >
                      <div className="p-4 space-y-4">
                         {/* Model Selection */}
                         <div className="space-y-2">
                           <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">AI Model Selection</h3>
                           <div className="relative group/model">
                             <select
                               value={selectedModel}
                               onChange={(e) => setSelectedModel(e.target.value)}
                               className="w-full bg-zinc-50 border border-minimal-border rounded-xl p-3 text-xs font-bold text-minimal-text outline-none focus:border-minimal-accent appearance-none cursor-pointer group-hover/model:border-minimal-accent/50 transition-all uppercase tracking-wide px-4"
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
                       <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
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
                      <div className="flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur pb-2 z-10">
                        <h3 className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Conversation history</h3>
                        <button 
                          onClick={() => setChatHistory([])}
                          className="text-[10px] font-bold text-minimal-accent hover:bg-minimal-accent/10 px-2 py-1 rounded transition-colors uppercase"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="space-y-6 pb-4">
                        {chatHistory.map((msg, idx) => (
                          <div key={idx} className={cn(
                            "flex flex-col gap-2 max-w-[90%]",
                            msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                          )}>
                            <div className={cn(
                              "px-4 py-3 rounded-2xl text-xs font-medium leading-relaxed",
                              msg.role === 'user' 
                                ? "bg-minimal-accent text-white rounded-tr-none shadow-md shadow-minimal-accent/20" 
                                : "bg-zinc-50 border border-minimal-border text-minimal-text rounded-tl-none"
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
                              <Markdown>{msg.parts[0].text}</Markdown>
                            </div>
                            <span className="text-[8px] font-bold text-minimal-muted uppercase tracking-widest opacity-60 px-1">
                              {msg.role === 'user' ? 'Direct Input' : 'Ink & Quill Intelligence'}
                            </span>
                          </div>
                        ))}
                        {isGeneratingAi && (
                          <div className="flex flex-col gap-2 items-start mr-auto max-w-[90%]">
                            <div className="px-5 py-3 bg-zinc-50 border border-minimal-border rounded-2xl rounded-tl-none flex items-center gap-1.5">
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

                <div className="p-4 md:p-6 bg-zinc-50 border-t border-minimal-border">
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
                        <button onClick={() => formatChatInput('bold')} className="p-1.5 hover:bg-zinc-200 rounded text-minimal-muted transition-colors" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                        <button onClick={() => formatChatInput('italic')} className="p-1.5 hover:bg-zinc-200 rounded text-minimal-muted transition-colors" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                        <button onClick={() => formatChatInput('list')} className="p-1.5 hover:bg-zinc-200 rounded text-minimal-muted transition-colors" title="Bullet List"><List className="w-3.5 h-3.5" /></button>
                        <div className="w-px h-3 bg-minimal-border mx-1" />
                        <button onClick={() => chatImageInputRef.current?.click()} className="p-1.5 hover:bg-zinc-200 rounded text-minimal-muted transition-colors" title="Attach Image"><ImagePlus className="w-3.5 h-3.5" /></button>
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
                            <button onClick={() => exportChat(chatHistory, 'json')} className="p-1.5 hover:bg-zinc-200 rounded text-minimal-muted transition-colors" title="Export as JSON"><Download className="w-3.5 h-3.5" /></button>
                            <button onClick={() => exportChat(chatHistory, 'md')} className="p-1.5 hover:bg-zinc-200 rounded text-minimal-muted transition-colors" title="Export as Markdown"><ImageIcon className="w-3.5 h-3.5" /></button>
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
                        className="w-full h-28 bg-white border border-minimal-border rounded-2xl p-4 text-xs focus:ring-4 focus:ring-minimal-accent/5 focus:border-minimal-accent outline-none transition-all resize-none font-medium leading-relaxed pr-12 group-hover:border-minimal-accent/50"
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
                         <button onClick={() => setAiPrompt("Brainstorm 5 topics for ")} className="p-2 border border-minimal-border rounded-xl text-[10px] font-bold uppercase tracking-wider text-minimal-muted hover:bg-white hover:text-minimal-accent transition-all">Quick Brainstorm</button>
                         <button onClick={() => setAiPrompt("Draft a professional ")} className="p-2 border border-minimal-border rounded-xl text-[10px] font-bold uppercase tracking-wider text-minimal-muted hover:bg-white hover:text-minimal-accent transition-all">Quick Draft</button>
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
              onClick={() => setShowSavedConversations(false)}
              className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm z-[110]"
            />
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="fixed inset-x-4 top-20 bottom-20 md:inset-x-auto md:right-8 md:top-24 md:bottom-24 md:w-[350px] bg-white border border-minimal-border rounded-3xl z-[120] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-minimal-border flex justify-between items-center bg-zinc-50 px-6">
                <div>
                   <h3 className="text-xs font-bold text-minimal-text uppercase tracking-widest">Saved Chats</h3>
                   <p className="text-[9px] font-bold text-minimal-muted uppercase tracking-tighter mt-0.5">{savedChats.length} Conversations</p>
                </div>
                <button onClick={() => setShowSavedConversations(false)} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
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
                      className="group/item bg-zinc-50 hover:bg-white border border-minimal-border hover:border-minimal-accent/30 rounded-2xl p-4 transition-all cursor-pointer shadow-sm hover:shadow-md"
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
                         <button 
                           onClick={() => exportChat(chat.history, 'md')}
                           className="text-[9px] font-bold text-minimal-accent hover:underline uppercase tracking-tight flex items-center gap-1"
                         >
                           <Download className="w-2.5 h-2.5" /> Export
                         </button>
                         <button 
                           onClick={() => deleteSavedChat(chat.id)}
                           className="ml-auto text-[9px] font-bold text-red-400 hover:text-red-600 uppercase tracking-tight flex items-center gap-1"
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
            className="fixed bottom-12 md:bottom-16 left-1/2 z-[100] w-[95%] max-w-[600px] bg-white border border-minimal-border rounded-3xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] overflow-hidden flex flex-col max-h-[70vh]"
          >
            <div className="px-6 py-4 border-b border-minimal-border flex items-center justify-between bg-zinc-50/50">
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

            <div className="flex-1 overflow-y-auto p-6 bg-white custom-scrollbar">
              <div className="prose prose-sm max-w-none font-medium text-minimal-text leading-relaxed prose-headings:text-minimal-accent prose-headings:font-bold prose-p:mb-4">
                <Markdown>{aiResult}</Markdown>
              </div>
            </div>

            <div className="p-4 bg-zinc-50 border-t border-minimal-border">
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
                    className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-minimal-border text-minimal-text rounded-2xl text-[10px] font-bold hover:bg-zinc-100 hover:border-minimal-accent/30 transition-all group"
                  >
                    <Plus className="w-4 h-4 text-minimal-accent group-hover:rotate-90 transition-transform" />
                    <span>INSERT</span>
                  </button>
                  <button
                    onClick={() => applyAiResult('append')}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-minimal-border text-minimal-text rounded-2xl text-[10px] font-bold hover:bg-zinc-100 hover:border-minimal-accent/30 transition-all group"
                  >
                    <ChevronDown className="w-4 h-4 text-minimal-accent group-hover:translate-y-0.5 transition-transform" />
                    <span>APPEND</span>
                  </button>
                  <button
                    onClick={() => applyAiResult('suggest')}
                    className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-minimal-border text-minimal-text rounded-2xl text-[10px] font-bold hover:bg-zinc-100 hover:border-minimal-accent/30 transition-all group"
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

      {/* Main Content Area */}
      <main className={cn(
        "flex-1 flex overflow-hidden bg-minimal-sidebar transition-all duration-1000",
        "pt-0"
      )}>
        {isFocusMode && (
          <div className="fixed top-8 right-8 z-50 flex flex-col gap-3">
            {/* Assistant Toggle */}
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 0.5, x: 0 }}
              whileHover={{ opacity: 1, scale: 1.05 }}
              onClick={() => setShowAiAssistant(!showAiAssistant)}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                showAiAssistant ? "bg-minimal-accent border-minimal-accent text-white" : "bg-white/90 border-minimal-border text-minimal-muted"
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
              onClick={() => { setShowSearch(!showSearch); setSearchIndex(-1); }}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                showSearch ? "bg-minimal-accent border-minimal-accent text-white" : "bg-white/90 border-minimal-border text-minimal-muted"
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
              onClick={() => setIsTypewriterMode(!isTypewriterMode)}
              className={cn(
                "p-3.5 backdrop-blur border rounded-full shadow-2xl transition-all duration-300",
                isTypewriterMode ? "bg-minimal-accent border-minimal-accent text-white" : "bg-white/90 border-minimal-border text-minimal-muted"
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
                "p-3.5 backdrop-blur border rounded-full shadow-2xl bg-white/90 border-minimal-border text-minimal-muted transition-all duration-300"
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
                wordGoal > 0 ? "bg-minimal-accent border-minimal-accent text-white" : "bg-white/90 border-minimal-border text-minimal-muted"
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
              className="p-3.5 bg-white/90 backdrop-blur border border-minimal-border rounded-full shadow-2xl text-minimal-muted transition-all duration-300"
              title="Wipe Document"
            >
              <Trash2 className="w-5 h-5" />
            </motion.button>

            {/* Snapshots Button */}
            <div className="relative group/snapshots">
              <motion.button
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 0.5, x: 0 }}
                whileHover={{ opacity: 1, scale: 1.05 }}
                className="p-3.5 bg-white/90 backdrop-blur border border-minimal-border rounded-full shadow-2xl text-minimal-muted transition-all duration-300"
                title="Document Snapshots"
              >
                <History className="w-5 h-5" />
              </motion.button>
              
              <div className="absolute right-full mr-4 top-0 hidden group-hover/snapshots:flex flex-col gap-1 w-48 bg-white border border-minimal-border rounded-2xl shadow-2xl p-2 z-[60]">
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
                      <button
                        key={s.id}
                        onClick={() => {
                          if (window.confirm("Restore this version? Your current work will be overwritten.")) {
                            setMarkdown(s.content);
                          }
                        }}
                        className="w-full text-left p-2 hover:bg-zinc-50 rounded-xl transition-all border border-transparent hover:border-minimal-border group/s"
                      >
                        <div className="flex justify-between items-center mb-0.5">
                           <span className="text-[10px] font-bold text-minimal-text">{new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               setSnapshots(prev => prev.filter(snap => snap.id !== s.id));
                             }}
                             className="opacity-0 group-hover/s:opacity-100 p-1 hover:text-red-500 transition-all"
                           >
                             <X className="w-2.5 h-2.5" />
                           </button>
                        </div>
                        <p className="text-[8px] text-minimal-muted truncate">{s.content.substring(0, 40)}...</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className={cn(
          "flex-1 relative flex flex-col transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]",
          showPreview ? "max-w-7xl" : "max-w-4xl mx-auto",
          "border-minimal-border",
          !isFocusMode 
            ? "bg-minimal-bg border-s border-e shadow-none" 
            : "my-8 mb-32 rounded-2xl bg-[#fdfdfc] border border-minimal-border/50 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.1),0_20px_40px_-25px_rgba(30,41,59,0.15)] ring-1 ring-black/[0.02]"
        )}>
          {/* Find and Replace Bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="absolute top-4 right-8 z-30 bg-white border border-minimal-border rounded-xl shadow-xl p-3 flex flex-col gap-2 w-[360px]"
              >
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-zinc-50 rounded-lg flex items-center px-3 border border-minimal-border focus-within:border-minimal-accent transition-colors">
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
                          isCaseSensitive ? "bg-minimal-accent text-white" : "text-minimal-muted hover:bg-zinc-100"
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
                          isWholeWord ? "bg-minimal-accent text-white border-minimal-accent" : "text-minimal-muted hover:bg-zinc-100 border-minimal-border"
                        )}
                        title="Match Whole Word"
                      >
                        W
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={handleFindNext} className="p-1.5 hover:bg-zinc-100 rounded text-minimal-muted" title="Find Next">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowSearch(false)} className="p-1.5 hover:bg-zinc-100 rounded text-minimal-muted">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-zinc-50 rounded-lg flex items-center px-3 border border-minimal-border focus-within:border-minimal-accent transition-colors">
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
                      className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 rounded text-[10px] font-bold text-minimal-text uppercase transition-colors"
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

          {/* Main Toolbar */}
          <div className="px-6 py-2 border-b border-minimal-border bg-white/50 backdrop-blur-sm flex items-center gap-1 overflow-x-auto custom-scrollbar no-scrollbar">
            {toolbarButtons.map((btn, i) => (
              <button
                key={i}
                onClick={btn.action}
                className={cn(
                  "p-2 rounded-lg transition-all duration-200 group relative",
                  btn.active 
                    ? "bg-minimal-accent text-white shadow-md" 
                    : "hover:bg-minimal-border text-minimal-muted hover:text-minimal-text"
                )}
                title={btn.label}
              >
                <btn.icon className="w-4 h-4" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-900 text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
                  {btn.label}
                </span>
              </button>
            ))}
          </div>

          <div className={cn("flex flex-1 min-h-0", showPreview && "flex-row")}>
            <div className={cn("flex flex-col flex-1 min-w-0 transition-all duration-500", showPreview && "border-e border-minimal-border/30")}>
              <ProseMirrorEditor
                ref={editorRef}
                value={markdown}
                onChange={setMarkdown}
                onKeyDown={handleKeyDown}
                isTypewriter={isTypewriterMode}
                direction={direction}
                aiPersonalInstructions={aiPersonalInstructions}
                selectedModel={selectedModel}
                onAiResult={(result) => {
                  setAiResult(result);
                  setShowAiAssistant(true);
                }}
                onAiStream={(chunk) => {
                  setAiResult(prev => (prev || '') + chunk);
                  setShowAiAssistant(true);
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
                searchOptions={{ isCaseSensitive, isWholeWord, searchIndex, currentMatchIndex }}
                className="flex-1 overflow-y-auto"
              />
            </div>
            {showPreview && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 overflow-y-auto p-8 md:p-12 bg-white/50 backdrop-blur-sm min-w-0"
              >
                <div className="max-w-prose mx-auto">
                  <header className="mb-8 pb-4 border-b border-minimal-border/20 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-minimal-muted uppercase tracking-[0.2em]">Live Preview</span>
                    <span className="text-[9px] font-mono text-minimal-muted opacity-40">AUTO-RENDERING</span>
                  </header>
                  <div className="prose prose-sm md:prose-base max-w-none prose-headings:text-minimal-text prose-headings:font-bold prose-p:text-minimal-text/80 prose-p:leading-relaxed prose-pre:bg-zinc-900 prose-pre:rounded-xl prose-img:rounded-xl">
                    <Markdown>{markdown}</Markdown>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      {/* Footer / Status */}
      <AnimatePresence mode="wait">
        <motion.footer 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          className={cn(
            "fixed bottom-0 inset-x-0 h-8 md:h-10 border-t border-minimal-border z-50 px-4 md:px-6 flex items-center justify-between text-[10px] md:text-[11px] tracking-tight transition-all duration-1000",
            isFocusMode ? "bg-transparent border-transparent text-minimal-muted/60" : "bg-minimal-bg text-minimal-muted"
          )}
        >
          <div className="flex gap-4 md:gap-6 items-center">
            <div className="flex gap-2 md:gap-4">
              <span className="font-medium">W: {wordCount}</span>
              <span className="hidden sm:inline opacity-60">C: {charCount}</span>
            </div>
            <div className="h-3 w-px bg-minimal-border/20 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2">
              <Clock className="w-3 h-3 opacity-60" />
              <span className="opacity-60">{readingTime} min read</span>
            </div>
            {wordGoal > 0 && (
              <>
                <div className="h-3 w-px bg-minimal-border/20 hidden md:block" />
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="w-16 md:w-32 h-1 bg-minimal-border/20 rounded-full overflow-hidden hidden sm:block">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${goalProgress}%` }}
                      className="h-full bg-minimal-accent"
                    />
                  </div>
                  <span className={cn(
                    "font-bold transition-colors",
                    goalProgress >= 100 ? "text-emerald-500" : "text-minimal-accent"
                  )}>
                    {Math.round(goalProgress)}% <span className="hidden sm:inline font-medium opacity-60">Complete</span>
                  </span>
                </div>
              </>
            )}
          </div>
          <div className={cn(
            "flex gap-4 font-mono text-[9px] uppercase tracking-widest items-center",
            isFocusMode ? "opacity-30" : "opacity-60"
          )}>
            {ollamaStatus.connected && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                <span>{ollamaStatus.model}</span>
              </div>
            )}
            <span className="hidden sm:inline">UTF-8</span>
            <span className="text-minimal-accent font-bold">MD</span>
          </div>
        </motion.footer>
      </AnimatePresence>
    </div>
  );
}
