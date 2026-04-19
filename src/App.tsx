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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import ProseMirrorEditor, { EditorRef } from './components/ProseMirrorEditor';
import { generateContentFromPrompt, processAIAction } from './services/aiService';

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
  const [aiPrompt, setAiPrompt] = useState('');
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
  const [direction, setDirection] = useState<'ltr' | 'rtl'>(() => {
    return (localStorage.getItem('ink-quill-dir') as 'ltr' | 'rtl') || 'ltr';
  });
  const [aiPersonalInstructions, setAiPersonalInstructions] = useState<string>(() => {
    return localStorage.getItem('ink-quill-ai-prefs') || "";
  });
  const [wordGoal, setWordGoal] = useState<number>(() => {
    const saved = localStorage.getItem('ink-quill-goal');
    return saved ? parseInt(saved) : 0;
  });
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

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAi(true);
    try {
      const generated = await generateContentFromPrompt(aiPrompt, markdown, aiPersonalInstructions);
      // Use editorRef for smoother integration
      const prefix = markdown.trim() ? "\n\n" : "";
      editorRef.current?.appendMarkdown(prefix + generated);
      setAiPrompt('');
      setShowAiAssistant(false);
    } catch (error) {
      console.error("AI Generation failed:", error);
      alert("AI Generation failed. Check console.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

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
    { icon: ImageIcon, label: 'Image', action: () => {
      const url = window.prompt("Enter Image URL:");
      if (url) {
        editorRef.current?.insertImage(url, "Image Alternative Text");
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
              <div className="p-6 border-b border-minimal-border flex justify-between items-center bg-zinc-50">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-minimal-accent flex items-center justify-center text-white shadow-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-minimal-text uppercase tracking-widest">AI Writing Partner</h2>
                    <p className="text-[10px] text-minimal-muted font-medium">Powered by Gemini</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowAiAssistant(false)}
                  className="p-2 hover:bg-minimal-border rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-minimal-muted" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <section>
                  <h3 className="text-xs font-bold text-minimal-muted uppercase tracking-wider mb-3">Refinement Preferences</h3>
                  <div className="bg-minimal-accent/5 border border-minimal-accent/20 rounded-2xl p-4">
                    <p className="text-[11px] text-minimal-accent font-bold mb-2 uppercase tracking-wide">AI Listening Profile</p>
                    <textarea
                      value={aiPersonalInstructions}
                      onChange={(e) => setAiPersonalInstructions(e.target.value)}
                      placeholder="e.g., 'Avoid jargon', 'Be witty', 'Keep sentences short'..."
                      className="w-full h-20 bg-transparent border-none p-0 text-xs focus:ring-0 outline-none transition-all resize-none font-medium leading-relaxed text-minimal-text placeholder:text-minimal-muted/50"
                    />
                    <div className="mt-2 flex items-center gap-2">
                       <Check className="w-3 h-3 text-minimal-accent" />
                       <span className="text-[10px] font-bold text-minimal-accent/70">Preferences will be applied to all future generations</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-minimal-muted uppercase tracking-wider mb-3">Compose Something New</h3>
                  <div className="relative">
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          handleAiGenerate();
                        }
                      }}
                      placeholder="e.g., 'Write a professional email inviting a client to a lunch meeting' or 'Generate 5 blog post ideas about minimalism'..."
                      className="w-full h-40 bg-zinc-50 border border-minimal-border rounded-2xl p-4 text-sm focus:ring-2 focus:ring-minimal-accent/20 focus:border-minimal-accent outline-none transition-all resize-none font-medium leading-relaxed"
                    />
                    <button
                      onClick={handleAiGenerate}
                      disabled={isGeneratingAi || !aiPrompt.trim()}
                      className="absolute bottom-3 right-3 p-3 bg-minimal-accent text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all"
                    >
                      {isGeneratingAi ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Sparkles className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-bold text-minimal-muted uppercase tracking-wider mb-3">Quick Actions</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { 
                        title: 'Improve Flow', 
                        desc: 'Refine syntax and vocabulary',
                        action: async () => {
                          const selected = editorRef.current?.getSelectedText();
                          if (!selected || !selected.trim()) {
                            alert("Please select text in the editor to use this action.");
                            return;
                          }
                          setIsGeneratingAi(true);
                          try {
                            const improved = await processAIAction(selected, 'improve', aiPersonalInstructions);
                            editorRef.current?.replaceSelectionWithMarkdown(improved);
                            setShowAiAssistant(false);
                          } catch (e) {
                            console.error(e);
                            alert("Failed to improve text.");
                          } finally {
                            setIsGeneratingAi(false);
                          }
                        }
                      },
                      { 
                        title: 'Summary', 
                        desc: 'Condense the current working document',
                        action: async () => {
                          setIsGeneratingAi(true);
                          try {
                            const summary = await generateContentFromPrompt("Please summarize the current text in 3 bullet points. Be concise.", markdown, aiPersonalInstructions);
                            editorRef.current?.appendMarkdown("\n\n### Document Summary\n" + summary);
                            setShowAiAssistant(false);
                          } catch (e) { console.error(e); }
                          finally { setIsGeneratingAi(false); }
                        }
                      },
                      { 
                        title: 'Draft from Outline', 
                        desc: 'Expand a selected outline into a full draft',
                        action: async () => {
                          const selected = editorRef.current?.getSelectedText();
                          if (!selected || !selected.trim()) {
                            alert("Please select your outline in the editor first.");
                            return;
                          }
                          setIsGeneratingAi(true);
                          try {
                            const draft = await processAIAction(selected, 'expand-outline', aiPersonalInstructions);
                            editorRef.current?.appendMarkdown("\n\n" + draft);
                            setShowAiAssistant(false);
                          } catch (e) {
                            console.error(e);
                            alert("Failed to extend from outline.");
                          } finally {
                            setIsGeneratingAi(false);
                          }
                        }
                      },
                      { 
                        title: 'Generate Outline', 
                        desc: 'Create a structural outline from current text',
                        action: async () => {
                          if (!markdown.trim()) {
                            alert("Document is empty. Try 'Draft Topic' instead.");
                            return;
                          }
                          setIsGeneratingAi(true);
                          try {
                            const outline = await processAIAction(markdown, 'generate-outline', aiPersonalInstructions);
                            editorRef.current?.appendMarkdown("\n\n### Structural Outline\n" + outline);
                            setShowAiAssistant(false);
                          } catch (e) { 
                            console.error(e); 
                            alert("Failed to generate outline.");
                          } finally { 
                            setIsGeneratingAi(false); 
                          }
                        }
                      },
                      { 
                        title: 'Draft Topic', 
                        desc: 'Get an AI starting point for any subject',
                        action: () => {
                          setAiPrompt("Draft a detailed piece about: ");
                          // Focus the prompt textarea
                          const textarea = document.querySelector('textarea:last-of-type') as HTMLTextAreaElement;
                          if (textarea) textarea.focus();
                        }
                      }
                    ]
.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={item.action}
                        className="w-full p-4 rounded-2xl border border-minimal-border hover:border-minimal-accent hover:bg-minimal-accent/5 text-left transition-all group"
                      >
                        <h4 className="text-sm font-bold text-minimal-text group-hover:text-minimal-accent transition-colors">{item.title}</h4>
                        <p className="text-xs text-minimal-muted mt-0.5">{item.desc}</p>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="p-6 bg-zinc-50 border-t border-minimal-border">
                <p className="text-[10px] text-center text-minimal-muted font-medium italic">
                  Tip: Highlight text in the editor for instant contextual editing.
                </p>
              </div>
            </motion.div>
          </>
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
          </div>
        )}
        <div className={cn(
          "flex-1 relative flex flex-col transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)]",
          "max-w-4xl mx-auto border-minimal-border",
          !isFocusMode 
            ? "bg-minimal-bg border-s border-e shadow-none" 
            : "max-w-3xl my-8 mb-32 rounded-2xl bg-[#fdfdfc] border border-minimal-border/50 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.1),0_20px_40px_-25px_rgba(30,41,59,0.15)] ring-1 ring-black/[0.02]"
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

          <ProseMirrorEditor
            ref={editorRef}
            value={markdown}
            onChange={setMarkdown}
            onKeyDown={handleKeyDown}
            isTypewriter={isTypewriterMode}
            direction={direction}
            aiPersonalInstructions={aiPersonalInstructions}
            searchQuery={showSearch ? findText : ''}
            searchOptions={{ isCaseSensitive, isWholeWord, searchIndex, currentMatchIndex }}
            className="flex-1 overflow-y-auto"
          />
        </div>
      </main>

      {/* Footer / Status */}
      <AnimatePresence mode="wait">
        {!isFocusMode && (
          <motion.footer 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 h-8 md:h-10 bg-minimal-bg border-t border-minimal-border z-50 px-4 md:px-6 flex items-center justify-between text-[10px] md:text-[11px] text-minimal-muted tracking-tight"
          >
            <div className="flex gap-4 md:gap-6 items-center">
              <div className="flex gap-2 md:gap-4">
                <span>Words: {wordCount}</span>
                <span className="hidden sm:inline">Characters: {charCount}</span>
              </div>
              <div className="h-3 w-px bg-minimal-border hidden sm:block" />
              <div className="hidden sm:flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span>{readingTime} min read</span>
              </div>
              {wordGoal > 0 && (
                <>
                  <div className="h-3 w-px bg-minimal-border hidden md:block" />
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-16 md:w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden hidden sm:block">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${goalProgress}%` }}
                        className="h-full bg-minimal-accent"
                      />
                    </div>
                    <span className="font-bold text-minimal-accent">{Math.round(goalProgress)}% <span className="hidden sm:inline">of goal</span></span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-4">
              <span className="hidden sm:inline">UTF-8</span>
              <span className="text-minimal-accent font-semibold tracking-wider">MD</span>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}
