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
  Download, 
  Trash2,
  FileText,
  ChevronDown,
  X,
  Search,
  ArrowRightLeft,
  Maximize2 as FocusOn,
  Minimize2 as FocusOff,
  Clock,
  Target,
  Type,
  Palette,
  Check,
  Sparkles,
  Send,
  Image as ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { TEMPLATES, THEMES, FONTS, type Template, type AppTheme, type AppFont } from './constants';
import ProseMirrorEditor, { EditorRef } from './components/ProseMirrorEditor';
import { generateContentFromPrompt, processAIAction } from './services/geminiService';

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
  const [activeTheme, setActiveTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('ink-quill-theme');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Find if it's a predefined theme or custom
        const found = THEMES.find(t => t.id === parsed.id);
        return found || parsed;
      } catch (e) {
        return THEMES[0];
      }
    }
    return THEMES[0];
  });
  const [activeFont, setActiveFont] = useState<AppFont>(() => {
    const saved = localStorage.getItem('ink-quill-font');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return FONTS.find(f => f.id === parsed.id) || FONTS[0];
      } catch (e) {
        return FONTS[0];
      }
    }
    return FONTS[0];
  });
  const [showTemplates, setShowTemplates] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchIndex, setSearchIndex] = useState(-1);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isTypewriterMode, setIsTypewriterMode] = useState(false);
  const [aiPersonalInstructions, setAiPersonalInstructions] = useState<string>(() => {
    return localStorage.getItem('ink-quill-ai-prefs') || "";
  });
  const [wordGoal, setWordGoal] = useState<number>(() => {
    const saved = localStorage.getItem('ink-quill-goal');
    return saved ? parseInt(saved) : 0;
  });
  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    localStorage.setItem('ink-quill-doc', markdown);
  }, [markdown]);

  useEffect(() => {
    if (wordGoal > 0) {
      localStorage.setItem('ink-quill-goal', wordGoal.toString());
    } else {
      localStorage.removeItem('ink-quill-goal');
    }
  }, [wordGoal]);

  useEffect(() => {
    localStorage.setItem('ink-quill-ai-prefs', aiPersonalInstructions);
  }, [aiPersonalInstructions]);

  useEffect(() => {
    localStorage.setItem('ink-quill-theme', JSON.stringify(activeTheme));
    
    // Apply theme colors to CSS variables
    const root = document.documentElement;
    root.style.setProperty('--minimal-bg', activeTheme.colors.bg);
    root.style.setProperty('--minimal-sidebar', activeTheme.colors.sidebar);
    root.style.setProperty('--minimal-border', activeTheme.colors.border);
    root.style.setProperty('--minimal-text', activeTheme.colors.text);
    root.style.setProperty('--minimal-muted', activeTheme.colors.muted);
    root.style.setProperty('--minimal-accent', activeTheme.colors.accent);
  }, [activeTheme]);

  useEffect(() => {
    localStorage.setItem('ink-quill-font', JSON.stringify(activeFont));
    document.documentElement.style.setProperty('--minimal-font', activeFont.family);
  }, [activeFont]);

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
      }
    }
  };

  const handleFindNext = () => {
    if (!findText) return;
    
    const flags = isCaseSensitive ? 'g' : 'gi';
    let pattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (isWholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    
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
      setSearchIndex(-1);
    } else {
      handleFindNext();
    }
  };

  const handleReplaceAll = () => {
    if (!findText) return;
    const flags = isCaseSensitive ? 'g' : 'gi';
    let pattern = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (isWholeWord) {
      pattern = `\\b${pattern}\\b`;
    }
    const regex = new RegExp(pattern, flags);
    const newMarkdown = markdown.replace(regex, replaceText);
    setMarkdown(newMarkdown);
  };

  const downloadMarkdown = () => {
    const element = document.createElement("a");
    const file = new Blob([markdown], { type: 'text/markdown' });
    element.href = URL.createObjectURL(file);
    element.download = "ink-quill-document.md";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const clearEditor = () => {
    if (window.confirm("Are you sure you want to clear your document? This cannot be undone.")) {
      setMarkdown("");
    }
  };

  const applyTemplate = (template: Template) => {
    if (markdown.trim() && markdown !== DEFAULT_MARKDOWN) {
      if (!window.confirm("Applying a template will overwrite your current document. Continue?")) {
        return;
      }
    }
    setMarkdown(template.content);
    setShowTemplates(false);
    
    // Smooth scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGeneratingAi(true);
    try {
      const generated = await generateContentFromPrompt(aiPrompt, markdown, aiPersonalInstructions);
      // Append to editor or replace if empty
      const newMarkdown = markdown.trim() ? markdown + "\n\n" + generated : generated;
      setMarkdown(newMarkdown);
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
    { icon: Bold, label: 'Bold', action: () => insertText('**', '**') },
    { icon: Italic, label: 'Italic', action: () => insertText('*', '*') },
    { icon: Code, label: 'Code', action: () => insertText('`', '`') },
    { icon: Quote, label: 'Quote', action: () => insertText('> ') },
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
    <div className={cn(
      "min-h-screen bg-minimal-bg text-minimal-text font-sans flex flex-col selection:bg-minimal-accent/20 transition-colors duration-500",
      isFocusMode && "overflow-hidden"
    )}>
      {/* Header / Toolbar */}
      <AnimatePresence>
        {!isFocusMode && (
          <motion.header 
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            className="fixed top-0 left-0 right-0 h-14 bg-minimal-bg border-b border-minimal-border z-50 px-6 flex items-center justify-between"
          >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 mr-2">
            <button
              onClick={() => setShowAiAssistant(!showAiAssistant)}
              className={cn(
                "flex items-center gap-2 py-1.5 px-3 rounded-lg transition-all border",
                showAiAssistant 
                  ? "bg-minimal-accent text-white border-minimal-accent shadow-lg shadow-minimal-accent/20" 
                  : "bg-minimal-accent/10 text-minimal-accent border-transparent hover:bg-minimal-accent/20"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[13px] font-bold">Assistant</span>
            </button>

            <div className="h-6 w-px bg-minimal-border mx-1" />

            <div className="relative">
              <button
                onClick={() => setShowThemes(!showThemes)}
                className={cn(
                  "flex items-center gap-2 group hover:bg-zinc-50 py-1.5 px-3 rounded-lg transition-colors border border-transparent",
                  showThemes ? "border-minimal-border bg-zinc-50" : "hover:border-minimal-border"
                )}
                title="Customize Theme"
              >
                <Palette className="w-3.5 h-3.5 text-minimal-muted" />
                <span className="text-[13px] font-semibold text-minimal-text">Theme</span>
                <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", showThemes && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showThemes && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowThemes(false)}
                      className="fixed inset-0 z-40"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-12 left-0 w-64 bg-white border border-minimal-border rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-3 border-b border-minimal-border bg-zinc-50 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">Interface Theme</span>
                      </div>
                      <div className="p-2 grid grid-cols-1 gap-1">
                        {THEMES.map((theme) => (
                          <button
                            key={theme.id}
                            onClick={() => {
                              setActiveTheme(theme);
                              setShowThemes(false);
                            }}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-lg transition-all text-left",
                              activeTheme.id === theme.id ? "bg-minimal-accent/5 text-minimal-accent" : "hover:bg-zinc-50 text-minimal-text"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-4 h-4 rounded-full border border-black/5 flex-shrink-0" 
                                style={{ backgroundColor: theme.colors.bg }}
                              />
                              <span className="text-[13px] font-medium">{theme.name}</span>
                            </div>
                            {activeTheme.id === theme.id && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                      <div className="p-3 border-t border-minimal-border bg-zinc-50 flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">Custom Accent</span>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#2c3e50'].map(color => (
                            <button
                              key={color}
                              onClick={() => {
                                setActiveTheme({
                                  ...activeTheme,
                                  id: 'custom-' + color,
                                  colors: { ...activeTheme.colors, accent: color }
                                });
                              }}
                              className="w-6 h-6 rounded-full border-2 border-transparent hover:scale-110 transition-all flex items-center justify-center p-0"
                              style={{ 
                                backgroundColor: color,
                                borderColor: activeTheme.colors.accent === color ? 'rgba(0,0,0,0.5)' : 'transparent'
                              }}
                            >
                              {activeTheme.colors.accent === color && <Check className="w-3 h-3 text-white" />}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 border-t border-minimal-border bg-zinc-50 flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-minimal-muted uppercase tracking-wider">Typography</span>
                        <div className="grid grid-cols-1 gap-1">
                          {FONTS.map(font => (
                            <button
                              key={font.id}
                              onClick={() => setActiveFont(font)}
                              className={cn(
                                "flex items-center justify-between p-2 rounded-lg transition-all text-left",
                                activeFont.id === font.id ? "bg-minimal-accent text-white shadow-md shadow-minimal-accent/20" : "hover:bg-zinc-100 text-minimal-text"
                              )}
                            >
                              <span style={{ fontFamily: font.family }} className="text-xs font-medium">{font.name}</span>
                              {activeFont.id === font.id && <Check className="w-3 h-3" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-2 group hover:bg-zinc-50 py-1.5 px-3 rounded-lg transition-colors border border-transparent hover:border-minimal-border"
              >
                <div className="w-6 h-6 bg-minimal-accent/10 rounded flex items-center justify-center text-minimal-accent">
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <span className="text-[13px] font-semibold text-minimal-text">Templates</span>
                <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", showTemplates && "rotate-180")} />
              </button>

              <AnimatePresence>
                {showTemplates && (
                  <>
                    {/* Backdrop */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowTemplates(false)}
                      className="fixed inset-0 z-40 bg-zinc-950/5 backdrop-blur-[1px]"
                    />
                    
                    {/* Popover */}
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-12 left-0 w-[420px] bg-white border border-minimal-border rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-minimal-border bg-zinc-50 flex justify-between items-center">
                        <span className="text-[11px] font-bold text-minimal-muted uppercase tracking-widest">Document Templates</span>
                        <button onClick={() => setShowTemplates(false)} className="text-minimal-muted hover:text-minimal-text">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="p-2 grid grid-cols-1 gap-1 max-h-[500px] overflow-y-auto">
                        {TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.id}
                            onClick={() => applyTemplate(tpl)}
                            className="flex flex-col items-start text-left p-4 rounded-lg hover:bg-zinc-50 transition-all group"
                          >
                            <span className="text-sm font-semibold text-minimal-text group-hover:text-minimal-accent transition-colors">
                              {tpl.name}
                            </span>
                            <span className="text-xs text-minimal-muted mt-0.5 line-clamp-1">
                              {tpl.description}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="p-3 bg-zinc-50 border-t border-minimal-border text-center">
                        <p className="text-[10px] text-minimal-muted italic">Applying a template replaces current editor content</p>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tracking-tight">InkQuill_Document.md</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-minimal-sidebar border border-minimal-border rounded text-minimal-muted font-bold tracking-wider uppercase">
              Saved
            </span>
          </div>
          
          <div className="h-4 w-px bg-minimal-border mx-2" />
          
          <div className="flex items-center gap-4">
            {toolbarButtons.map((btn, i) => (
              <button
                key={i}
                onClick={btn.action}
                className="text-minimal-muted hover:text-minimal-text transition-colors"
                title={btn.label}
              >
                <btn.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsTypewriterMode(!isTypewriterMode)}
              className={cn(
                "p-1.5 rounded transition-colors flex items-center gap-2",
                isTypewriterMode ? "bg-minimal-accent/10 text-minimal-accent shadow-inner" : "text-minimal-muted hover:text-minimal-text"
              )}
              title="Typewriter Mode (Center Cursor)"
            >
              <Type className="w-4 h-4" />
              <span className="text-xs font-medium">Typewriter</span>
            </button>
            <div className="h-4 w-px bg-minimal-border mx-1" />
            <button
              onClick={() => setIsFocusMode(true)}
              className="p-1.5 rounded text-minimal-muted hover:text-minimal-accent transition-colors flex items-center gap-2"
              title="Focus Mode (Zen)"
            >
              <FocusOn className="w-4 h-4" />
              <span className="text-xs font-medium">Zen</span>
            </button>
            <div className="h-4 w-px bg-minimal-border mx-1" />
            <button
              onClick={() => {
                const goal = window.prompt("Set your word count goal:", wordGoal.toString());
                if (goal !== null) {
                  setWordGoal(parseInt(goal) || 0);
                }
              }}
              className={cn(
                "p-1.5 rounded transition-colors flex items-center gap-2",
                wordGoal > 0 ? "text-minimal-accent" : "text-minimal-muted hover:text-minimal-text"
              )}
              title="Set Word Goal"
            >
              <Target className={cn("w-4 h-4", wordGoal > 0 && "animate-pulse")} />
            </button>
            <button
              onClick={() => {
                setShowSearch(!showSearch);
                setSearchIndex(-1);
              }}
              className={cn(
                "p-1.5 rounded transition-colors flex items-center gap-2",
                showSearch ? "bg-minimal-accent/10 text-minimal-accent" : "text-minimal-muted hover:text-minimal-text"
              )}
              title="Find & Replace (Ctrl+F)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Find</span>
            </button>
            <button
              onClick={downloadMarkdown}
              className="text-xs font-medium text-minimal-text hover:text-minimal-accent transition-colors"
            >
              Export .md
            </button>
            <button
              onClick={clearEditor}
              className="text-minimal-muted hover:text-red-500 transition-colors"
              title="Clear Document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
          </motion.header>
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
              className="fixed top-0 right-0 bottom-0 w-[400px] bg-white border-l border-minimal-border z-[70] shadow-2xl flex flex-col"
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
                        action: () => alert("Select text in the editor to use this action.")
                      },
                      { 
                        title: 'Summary', 
                        desc: 'Condense the current working document',
                        action: async () => {
                          setIsGeneratingAi(true);
                          try {
                            const summary = await generateContentFromPrompt("Please summarize the current text in 3 bullet points.", markdown, aiPersonalInstructions);
                            setMarkdown(markdown + "\n\n### Summary\n" + summary);
                            setShowAiAssistant(false);
                          } catch (e) { console.error(e); }
                          finally { setIsGeneratingAi(false); }
                        }
                      },
                      { 
                        title: 'Draft from Outline', 
                        desc: 'Expand a selected outline into a full draft',
                        action: () => {
                          setShowAiAssistant(false);
                          alert("Highlight your outline in the editor, and select 'Expand from Outline' from the AI bubble menu.");
                        }
                      },
                      { 
                        title: 'Outline Document', 
                        desc: 'Generate a structural outline from current text',
                        action: async () => {
                          if (!markdown.trim()) {
                            alert("Document is empty. Try 'Outline Topic' instead.");
                            return;
                          }
                          setIsGeneratingAi(true);
                          try {
                            const outline = await processAIAction(markdown, 'generate-outline', aiPersonalInstructions);
                            setMarkdown(markdown + "\n\n### Document Outline\n" + outline);
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
                        title: 'Outline Topic', 
                        desc: 'Create a structure for a specific subject',
                        action: () => {
                          setAiPrompt("Generate a detailed structural outline for: ");
                          // Focus the textarea
                          const textarea = document.querySelector('textarea');
                          if (textarea) textarea.focus();
                        }
                      }
                    ].map((item, idx) => (
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
        "flex-1 flex overflow-hidden bg-minimal-sidebar transition-all duration-700",
        isFocusMode ? "pt-0" : "pt-14"
      )}>
        {isFocusMode && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            whileHover={{ opacity: 1 }}
            onClick={() => setIsFocusMode(false)}
            className="fixed top-8 right-8 z-50 p-3 bg-white/80 backdrop-blur border border-minimal-border rounded-full shadow-lg text-minimal-muted hover:text-minimal-accent transition-all"
            title="Exit Focus Mode"
          >
            <FocusOff className="w-5 h-5" />
          </motion.button>
        )}
        <div className={cn(
          "flex-1 relative flex flex-col transition-all duration-700",
          "max-w-4xl mx-auto bg-minimal-bg border-minimal-border",
          !isFocusMode ? "border-x" : "max-w-3xl"
        )}>
          {/* Find and Replace Bar */}
          <AnimatePresence>
            {showSearch && (
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                className="absolute top-4 right-8 z-30 bg-white border border-minimal-border rounded-xl shadow-xl p-3 flex flex-col gap-2 w-80"
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
                    <ArrowRightLeft className="w-3.5 h-3.5 text-minimal-muted mr-2" />
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
            aiPersonalInstructions={aiPersonalInstructions}
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
            className="fixed bottom-0 left-0 right-0 h-8 bg-minimal-bg border-t border-minimal-border z-50 px-6 flex items-center justify-between text-[11px] text-minimal-muted tracking-tight"
          >
            <div className="flex gap-6 items-center">
              <div className="flex gap-4">
                <span>Words: {wordCount}</span>
                <span>Characters: {charCount}</span>
              </div>
              <div className="h-3 w-px bg-minimal-border" />
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span>{readingTime} min read</span>
              </div>
              {wordGoal > 0 && (
                <>
                  <div className="h-3 w-px bg-minimal-border" />
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${goalProgress}%` }}
                        className="h-full bg-minimal-accent"
                      />
                    </div>
                    <span className="font-bold text-minimal-accent">{Math.round(goalProgress)}% of goal</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex gap-4">
              <span>UTF-8</span>
              <span className="text-minimal-accent font-semibold tracking-wider">MARKDOWN</span>
            </div>
          </motion.footer>
        )}
      </AnimatePresence>
    </div>
  );
}
