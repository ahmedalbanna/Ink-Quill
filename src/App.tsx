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
  Languages,
  Menu,
  History,
  FileDown,
  Image as ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { TEMPLATES, THEMES, FONTS, type Template, type AppTheme, type AppFont } from './constants';
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

interface Version {
  id: string;
  timestamp: string;
  content: string;
  wordCount: number;
}

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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [isCaseSensitive, setIsCaseSensitive] = useState(false);
  const [isWholeWord, setIsWholeWord] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isTypewriterMode, setIsTypewriterMode] = useState(false);
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
  const [history, setHistory] = useState<Version[]>(() => {
    const saved = localStorage.getItem('ink-quill-history');
    return saved ? JSON.parse(saved) : [];
  });
  const [showHistory, setShowHistory] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const editorRef = useRef<EditorRef>(null);

  useEffect(() => {
    localStorage.setItem('ink-quill-doc', markdown);
  }, [markdown]);

  useEffect(() => {
    localStorage.setItem('ink-quill-history', JSON.stringify(history));
  }, [history]);

  // Auto-save checkpoints every 5 minutes if content changed
  useEffect(() => {
    const interval = setInterval(() => {
      const lastVersion = history[0];
      if (!lastVersion || lastVersion.content !== markdown) {
        saveVersion();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [markdown, history]);

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
    setShowExport(false);
  };

  const exportToHtml = () => {
    const htmlContent = editorRef.current?.getHtml() || "";
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Ink & Quill Export</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: ${activeTheme.colors.text}; background: ${activeTheme.colors.bg}; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1, h2, h3 { color: ${activeTheme.colors.text}; }
          pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
          code { font-family: monospace; }
          blockquote { border-left: 4px solid ${activeTheme.colors.accent}; padding-left: 20px; color: #666; font-style: italic; }
          img { max-width: 100%; border-radius: 8px; }
          table { border-collapse: collapse; width: 100%; margin: 20px 0; }
          th, td { border: 1px solid ${activeTheme.colors.border}; padding: 12px; text-align: left; }
          th { background: #f8f8f8; }
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    const element = document.createElement("a");
    const file = new Blob([fullHtml], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    element.download = "ink-quill-document.html";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    setShowExport(false);
  };

  const exportToPdf = async () => {
    const htmlContent = editorRef.current?.getHtml() || "";
    const container = document.createElement('div');
    container.innerHTML = htmlContent;
    container.style.padding = '40px';
    container.style.color = activeTheme.colors.text;
    container.classList.add('markdown-body'); // Reuse existing styles if possible or defined globaly
    
    // Dynamically import html2pdf if needed or assume installed
    // @ts-ignore
    const html2pdf = (await import('html2pdf.js')).default;
    
    const opt = {
      margin: 1,
      filename: 'ink-quill-document.pdf',
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const }
    };

    html2pdf().set(opt).from(container).save();
    setShowExport(false);
  };

  const saveVersion = (manual: boolean = false) => {
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;
    const newVersion: Version = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      content: markdown,
      wordCount
    };
    
    setHistory(prev => [newVersion, ...prev].slice(0, 50)); // Keep last 50 versions
    if (manual) alert("Version snapshot saved successfully.");
  };

  const revertToVersion = (version: Version) => {
    if (window.confirm(`Revert to version from ${new Date(version.timestamp).toLocaleString()}? Current unsaved changes will be lost.`)) {
      setMarkdown(version.content);
      setShowHistory(false);
    }
  };

  const deleteVersion = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(v => v.id !== id));
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
    <div 
      dir={direction}
      className={cn(
        "min-h-screen bg-minimal-bg text-minimal-text font-sans flex flex-col selection:bg-minimal-accent/20 transition-colors duration-500",
        isFocusMode && "overflow-hidden"
      )}
    >
      {/* Header / Toolbar */}
      <AnimatePresence>
        {!isFocusMode && (
          <motion.header 
            initial={{ y: -60 }}
            animate={{ y: 0 }}
            exit={{ y: -60 }}
            className="fixed top-0 inset-x-0 h-14 bg-minimal-bg border-b border-minimal-border z-50 px-4 md:px-6 flex items-center justify-between"
          >
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="md:hidden p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5 text-minimal-muted" />
          </button>

          <div className="hidden md:flex items-center gap-1.5 me-2">
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

            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                "p-2 rounded-lg transition-colors border border-transparent",
                showHistory ? "bg-minimal-accent/10 text-minimal-accent border-minimal-accent/20" : "text-minimal-muted hover:bg-zinc-50"
              )}
              title="Version History"
            >
              <History className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-minimal-border mx-1" />

            {/* Appearance Settings */}
            <div className="relative">
              <button
                onClick={() => setShowThemes(!showThemes)}
                className={cn(
                  "p-2 rounded-lg transition-colors border border-transparent hover:bg-zinc-50 font-bold",
                  showThemes ? "bg-zinc-100 border-minimal-border text-minimal-accent" : "text-minimal-muted"
                )}
                title="Themes & Typography"
              >
                <Palette className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showThemes && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowThemes(false)} className="fixed inset-0 z-40" />
                    <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-10 left-0 w-64 bg-white border border-minimal-border rounded-xl shadow-2xl z-50 overflow-hidden">
                      <div className="p-3.5 border-b border-minimal-border bg-zinc-50 flex justify-between items-center text-minimal-muted font-bold tracking-widest text-[9px] uppercase">
                        <span>Personalization</span>
                        <X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setShowThemes(false)} />
                      </div>
                      <div className="p-1 grid grid-cols-1 gap-0.5 max-h-[250px] overflow-y-auto">
                        {THEMES.map((theme) => (
                          <button key={theme.id} onClick={() => { setActiveTheme(theme); localStorage.setItem('ink-quill-theme', JSON.stringify(theme)); }} className={cn("flex items-center justify-between p-2.5 rounded-lg transition-all", activeTheme.id === theme.id ? "bg-minimal-accent/10 text-minimal-accent" : "hover:bg-zinc-50")}>
                            <div className="flex items-center gap-3"><div className="w-3.5 h-3.5 rounded-full border border-black/5" style={{ backgroundColor: theme.colors.bg }} /><span className="text-xs font-semibold">{theme.name}</span></div>
                            {activeTheme.id === theme.id && <Check className="w-3 h-3" />}
                          </button>
                        ))}
                      </div>
                      <div className="p-3.5 border-t border-minimal-border bg-zinc-50 space-y-3">
                        <span className="text-[9px] font-bold text-minimal-muted uppercase tracking-widest block">Typography</span>
                        <div className="grid grid-cols-1 gap-0.5">
                          {FONTS.map(font => (
                            <button key={font.id} onClick={() => { setActiveFont(font); localStorage.setItem('ink-quill-font', JSON.stringify(font)); }} className={cn("flex items-center justify-between p-2 rounded-lg transition-all", activeFont.id === font.id ? "bg-minimal-accent/10 text-minimal-accent font-bold" : "hover:bg-zinc-50")}>
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

            {/* Templates Popover */}
            <div className="relative">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className={cn(
                  "p-2 rounded-lg transition-colors border border-transparent hover:bg-zinc-50 font-bold",
                  showTemplates ? "bg-zinc-100 border-minimal-border text-minimal-accent" : "text-minimal-muted"
                )}
                title="Templates"
              >
                <FileText className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {showTemplates && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTemplates(false)} className="fixed inset-0 z-40" />
                    <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-10 left-0 w-[300px] bg-white border border-minimal-border rounded-xl shadow-2xl z-50 overflow-hidden">
                      <div className="p-3.5 border-b border-minimal-border bg-zinc-50 flex justify-between items-center text-minimal-muted font-bold tracking-widest text-[9px] uppercase"><span>Draft Blueprints</span><X className="w-2.5 h-2.5 cursor-pointer" onClick={() => setShowTemplates(false)} /></div>
                      <div className="p-1 max-h-[350px] overflow-y-auto">
                        {TEMPLATES.map(tpl => (
                           <button key={tpl.id} onClick={() => applyTemplate(tpl)} className="w-full flex flex-col items-start p-3 rounded-lg hover:bg-zinc-50 transition-all group text-left">
                             <span className="text-xs font-bold text-minimal-text group-hover:text-minimal-accent">{tpl.name}</span>
                             <span className="text-[10px] text-minimal-muted mt-0.5 line-clamp-1">{tpl.description}</span>
                           </button>
                        ))}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Center: Contextual Info */}
          <div className="flex-1 flex justify-center min-w-0 px-4">
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-zinc-50 rounded-full border border-minimal-border max-w-[200px] lg:max-w-none shadow-sm">
              <span className="text-xs font-bold text-minimal-text truncate tracking-tight">InkQuill_Document.md</span>
              <div className="h-3 w-px bg-minimal-border hidden sm:block" />
              <div className="hidden sm:flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[10px] text-minimal-muted font-bold uppercase tracking-widest">Live</span>
              </div>
            </div>
          </div>

          {/* Right Section: View & Primary Actions */}
          <div className="flex items-center gap-1 md:gap-3">
            {/* Formatting Toolbar - Only visible on wide desktop screens */}
            <div className="hidden 2xl:flex items-center gap-1 me-2 pr-3 border-e border-minimal-border">
              {toolbarButtons.map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.action}
                  className="p-1.5 text-minimal-muted hover:text-minimal-text hover:bg-zinc-50 rounded transition-colors"
                  title={btn.label}
                >
                  <btn.icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => { setShowSearch(!showSearch); setSearchIndex(-1); }}
                className={cn(
                  "p-2 rounded-lg transition-colors border border-transparent",
                  showSearch ? "bg-minimal-accent/10 text-minimal-accent border-minimal-accent/20" : "text-minimal-muted hover:bg-zinc-50"
                )}
                title="Find & Replace"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* View Settings Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={cn(
                    "p-2 rounded-lg transition-colors border border-transparent hover:bg-zinc-50 font-bold",
                    showSettings ? "bg-zinc-100 border-minimal-border text-minimal-accent" : "text-minimal-muted"
                  )}
                  title="View & Focus Modes"
                >
                  <Type className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {showSettings && (
                    <>
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSettings(false)} className="fixed inset-0 z-40" />
                      <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} className="absolute top-10 right-0 w-64 bg-white border border-minimal-border rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-4 border-b border-minimal-border bg-zinc-50">
                          <span className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest">Canvas Settings</span>
                        </div>
                        <div className="p-2 space-y-1">
                          <button onClick={() => setIsTypewriterMode(!isTypewriterMode)} className={cn("w-full flex items-center justify-between p-3 rounded-lg transition-colors", isTypewriterMode ? "bg-minimal-accent/5 text-minimal-accent" : "hover:bg-zinc-50")}>
                            <div className="flex items-center gap-3"><Type className="w-4 h-4" /><div className="text-left font-bold text-xs"><p>Typewriter</p><p className="text-[10px] opacity-60 font-medium italic">Fixed Center Cursor</p></div></div>
                            {isTypewriterMode && <Check className="w-3 h-3" />}
                          </button>
                          <button onClick={() => { setIsFocusMode(true); setShowSettings(false); }} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-50 transition-colors">
                            <FocusOn className="w-4 h-4 text-minimal-muted" /><div className="text-left font-bold text-xs"><p>Zen Mode</p><p className="text-[10px] opacity-60 font-medium italic">Full-screen immersion</p></div>
                          </button>
                          <button onClick={() => setDirection(direction === 'ltr' ? 'rtl' : 'ltr')} className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 transition-colors text-xs font-bold">
                            <div className="flex items-center gap-3"><Languages className="w-4 h-4 text-minimal-muted" /><span>Orientation: {direction.toUpperCase()}</span></div>
                          </button>
                          <div className="h-px bg-minimal-border my-2" />
                          <div className="px-3 pb-3 space-y-3">
                            <div className="flex items-center justify-between">
                               <div className="flex items-center gap-2 font-bold text-xs"><Target className={cn("w-4 h-4", wordGoal > 0 ? "text-minimal-accent" : "text-minimal-muted")} /><span>Goal</span></div>
                               <button onClick={() => { const goal = window.prompt("Set your word count goal:", wordGoal.toString()); if (goal !== null) setWordGoal(parseInt(goal) || 0); }} className="text-[10px] font-bold text-minimal-accent underline">{wordGoal > 0 ? `${wordGoal} words` : "Set"}</button>
                            </div>
                            {wordGoal > 0 && <div className="w-full h-1 bg-zinc-200 rounded-full overflow-hidden self-end"><motion.div initial={{ width: 0 }} animate={{ width: `${goalProgress}%` }} className="h-full bg-minimal-accent" /></div>}
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <div className="h-4 w-px bg-minimal-border mx-1" />

              {/* Share & Cleanup Actions */}
              <div className="flex items-center gap-1">
                <div className="relative">
                  <button
                    onClick={() => setShowExport(!showExport)}
                    className={cn(
                      "p-2 rounded-lg transition-colors border border-transparent hover:bg-zinc-50",
                      showExport ? "bg-zinc-100 border-minimal-border text-minimal-accent" : "text-minimal-muted"
                    )}
                    title="Share and Export Document"
                  >
                    <FileDown className="w-4 h-4" />
                  </button>
                  <AnimatePresence>
                    {showExport && (
                      <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowExport(false)} className="fixed inset-0 z-40" />
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute top-10 right-0 w-48 bg-white border border-minimal-border rounded-xl shadow-2xl z-50 overflow-hidden p-1.5 flex flex-col gap-0.5">
                          <button onClick={downloadMarkdown} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors">
                            <div className="w-7 h-7 bg-blue-50 text-blue-500 rounded flex items-center justify-center font-bold text-[9px]">MD</div>
                            <span className="text-xs font-bold">Markdown</span>
                          </button>
                          <button onClick={exportToHtml} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors">
                            <div className="w-7 h-7 bg-orange-50 text-orange-500 rounded flex items-center justify-center font-bold text-[9px]">HTML</div>
                            <span className="text-xs font-bold">Web Page</span>
                          </button>
                          <button onClick={exportToPdf} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors">
                            <div className="w-7 h-7 bg-red-50 text-red-500 rounded flex items-center justify-center font-bold text-[9px]">PDF</div>
                            <span className="text-xs font-bold">Portable PDF</span>
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
                <button
                  onClick={clearEditor}
                  className="p-2 text-minimal-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Wipe Document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
          </motion.header>
        )}
      </AnimatePresence>

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
                  <p className="px-3 text-[10px] font-bold text-minimal-muted uppercase tracking-wider mb-2">Style</p>
                  <button
                    onClick={() => { setShowThemes(true); setShowMobileMenu(false); }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 text-minimal-text transition-colors"
                  >
                    <Palette className="w-4 h-4 text-minimal-muted" />
                    <span className="text-sm font-medium">Themes & Fonts</span>
                  </button>
                  <button
                    onClick={() => { setShowTemplates(true); setShowMobileMenu(false); }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 text-minimal-text transition-colors"
                  >
                    <FileText className="w-4 h-4 text-minimal-muted" />
                    <span className="text-sm font-medium">Templates</span>
                  </button>
                  <button
                    onClick={() => { setShowHistory(true); setShowMobileMenu(false); }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 text-minimal-text transition-colors"
                  >
                    <History className="w-4 h-4 text-minimal-muted" />
                    <span className="text-sm font-medium">Version History</span>
                  </button>
                </div>

                <div className="space-y-1">
                  <p className="px-3 text-[10px] font-bold text-minimal-muted uppercase tracking-wider mb-2">Actions</p>
                  <div className="grid grid-cols-3 gap-2 px-3 mb-2">
                    <button
                      onClick={downloadMarkdown}
                      className="flex flex-col items-center gap-2 p-3 bg-zinc-50 rounded-xl hover:bg-blue-50 transition-colors"
                    >
                      <Download className="w-4 h-4 text-blue-500" />
                      <span className="text-[10px] font-bold">Markdown</span>
                    </button>
                    <button
                      onClick={exportToHtml}
                      className="flex flex-col items-center gap-2 p-3 bg-zinc-50 rounded-xl hover:bg-orange-50 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-orange-500" />
                      <span className="text-[10px] font-bold">HTML</span>
                    </button>
                    <button
                      onClick={exportToPdf}
                      className="flex flex-col items-center gap-2 p-3 bg-zinc-50 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      <FileDown className="w-4 h-4 text-red-500" />
                      <span className="text-[10px] font-bold">PDF</span>
                    </button>
                  </div>
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

      {/* Version History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
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
                    <History className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-minimal-text uppercase tracking-widest">Version History</h2>
                    <p className="text-[10px] text-minimal-muted font-medium">Auto-checkpoints enabled</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-minimal-border rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-minimal-muted" />
                </button>
              </div>

              <div className="p-4 bg-minimal-accent/5 border-b border-minimal-border">
                <button
                  onClick={() => saveVersion(true)}
                  className="w-full flex items-center justify-center gap-2 p-3 bg-minimal-accent text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all text-sm font-bold"
                >
                  <Check className="w-4 h-4" />
                  Save Manual Snapshot
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8 opacity-50">
                    <History className="w-12 h-12 mb-4 text-minimal-muted" />
                    <p className="text-sm font-medium">No history yet.</p>
                    <p className="text-xs">Snapshots are taken every 5 mins or when you manually save.</p>
                  </div>
                ) : (
                  history.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => revertToVersion(v)}
                      className="group p-4 rounded-2xl border border-minimal-border hover:border-minimal-accent hover:bg-minimal-accent/5 cursor-pointer transition-all relative"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold text-minimal-text">
                          {new Date(v.timestamp).toLocaleDateString()} at {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={(e) => deleteVersion(v.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 text-red-500 rounded transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-minimal-muted font-bold uppercase tracking-wider">
                        <span>{v.wordCount} words</span>
                        <div className="w-1 h-1 rounded-full bg-minimal-border" />
                        <span className="text-minimal-accent/70">Snapshot #{v.id.substring(0, 4)}</span>
                      </div>
                      <p className="mt-2 text-[11px] text-minimal-muted line-clamp-2 italic leading-relaxed">
                        "{v.content.substring(0, 100)}..."
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="p-6 bg-zinc-50 border-t border-minimal-border">
                <p className="text-[10px] text-center text-minimal-muted font-medium italic">
                  Tip: Versions are stored locally in your browser. Clearing browser data will remove them.
                </p>
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
        "flex-1 flex overflow-hidden bg-minimal-sidebar transition-all duration-700",
        isFocusMode ? "pt-0" : "pt-14"
      )}>
        {isFocusMode && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            whileHover={{ opacity: 1 }}
            onClick={() => setIsFocusMode(false)}
            className="fixed top-8 end-8 z-50 p-3 bg-white/80 backdrop-blur border border-minimal-border rounded-full shadow-lg text-minimal-muted hover:text-minimal-accent transition-all"
            title="Exit Focus Mode"
          >
            <FocusOff className="w-5 h-5" />
          </motion.button>
        )}
        <div className={cn(
          "flex-1 relative flex flex-col transition-all duration-700",
          "max-w-4xl mx-auto bg-minimal-bg border-minimal-border",
          !isFocusMode ? "border-s border-e" : "max-w-3xl"
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
