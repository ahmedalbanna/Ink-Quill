import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { Schema, DOMParser, DOMSerializer, Slice } from 'prosemirror-model';
import { schema as baseSchema } from 'prosemirror-markdown';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, setBlockType, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { buildInputRules, buildKeymap } from './prose-setup';
import { highlightPlugin } from './prose-highlight';
import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownSerializer } from 'prosemirror-markdown';
import { 
  Bold, 
  Italic, 
  Link, 
  Code, 
  Quote, 
  Type, 
  Underline,
  Strikethrough,
  Sparkles, 
  Wand2, 
  CheckCheck, 
  AlignLeft, 
  ArrowRight, 
  Image as ImageIcon,
  Heading,
  Heading1,
  Heading2,
  Heading3,
  Minimize2,
  Maximize2,
  Zap,
  Layout,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { processAIAction, type AIAssistantAction } from '../services/aiService';
import { getKrokiUrl } from '../lib/kroki';

// We'll use a slightly customized schema to support more formatting
const editorSchema = new Schema({
  nodes: baseSchema.spec.nodes,
  marks: baseSchema.spec.marks.append({
    strike: {
      parseDOM: [
        { tag: "s" }, 
        { tag: "del" }, 
        { tag: "strike" },
        { style: "text-decoration=line-through" }
      ],
      toDOM() { return ["s", 0] }
    },
    underline: {
      parseDOM: [
        { tag: "u" }, 
        { style: "text-decoration=underline" }
      ],
      toDOM() { return ["u", 0] }
    }
  })
});

// Custom serializer to handle our new marks
const editorSerializer = new MarkdownSerializer(defaultMarkdownSerializer.nodes, {
  ...defaultMarkdownSerializer.marks,
  strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
  underline: { open: "<u>", close: "</u>", mixable: true }
});

class UmlNodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  img: HTMLImageElement | null = null;
  node: any;
  view: any;
  getPos: any;

  updateImageTimeout: any = null;

  constructor(node: any, view: any, getPos: any) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement("div");
    this.dom.className = "uml-code-block-container";
    
    this.contentDOM = document.createElement("pre");
    this.contentDOM.className = "uml-code-block-editor";
    this.dom.appendChild(this.contentDOM);
    
    // Add a slight delay to ensure content is available or wait for update
    this.scheduleUpdate();
  }

  update(node: any) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.scheduleUpdate();
    return true;
  }

  scheduleUpdate() {
    if (this.updateImageTimeout) clearTimeout(this.updateImageTimeout);
    this.updateImageTimeout = setTimeout(() => this.updateImage(), 500);
  }

  updateImage() {
    const lang = this.node.attrs.params || "";
    const umlLangs = [
      'mermaid', 'plantuml', 'graphviz', 'ditaa', 'erd', 'blockdiag', 
      'c4plantuml', 'structurizr', 'vega', 'vegalite', 'bpmn', 'd2',
      'nomnoml', 'rackdiag', 'seqdiag', 'actdiag', 'nwdiag'
    ];
    
    if (umlLangs.includes(lang.trim().toLowerCase())) {
      const url = getKrokiUrl(lang.trim(), this.node.textContent);
      if (url) {
        if (!this.img) {
          this.img = document.createElement("img");
          this.img.className = "uml-diagram-preview";
          this.dom.appendChild(this.img);
        }
        this.img.src = url;
        this.dom.classList.add('is-rendering');
        this.img.onload = () => this.dom.classList.remove('is-rendering');
      } else if (this.img) {
        this.img.remove();
        this.img = null;
        this.dom.classList.remove('is-rendering');
      }
    } else if (this.img) {
      this.img.remove();
      this.img = null;
      this.dom.classList.remove('is-rendering');
    }
  }

  destroy() {
    if (this.updateImageTimeout) clearTimeout(this.updateImageTimeout);
  }

  ignoreSelection() { return true; }
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent) => void;
  className?: string;
  placeholder?: string;
  isTypewriter?: boolean;
  direction?: 'ltr' | 'rtl';
  aiPersonalInstructions?: string;
  selectedModel?: string;
  onAiResult?: (result: string) => void;
  onAiStream?: (chunk: string) => void;
  onImageUploadRequest?: () => void;
  searchQuery?: string;
  searchOptions?: {
    isCaseSensitive: boolean;
    isWholeWord: boolean;
    searchIndex: number;
    currentMatchIndex: number;
  };
}

export interface EditorRef {
  focus: () => void;
  insertText: (before: string, after?: string) => void;
  insertImage: (src: string, alt?: string, title?: string) => void;
  appendMarkdown: (markdown: string) => void;
  replaceSelectionWithMarkdown: (markdown: string) => void;
  getSelectedText: () => string;
  getHtml: () => string;
  handleFormat: (type: string) => void;
}

const ProseMirrorEditor = forwardRef<EditorRef, Props>(({ 
  value, 
  onChange, 
  onKeyDown, 
  className, 
  placeholder, 
  isTypewriter, 
  direction = 'ltr', 
  aiPersonalInstructions,
  selectedModel = 'mistral',
  onAiResult,
  onAiStream,
  onImageUploadRequest,
  searchQuery = '',
  searchOptions = { isCaseSensitive: false, isWholeWord: false, searchIndex: -1, currentMatchIndex: 0 }
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isUpdatingFromProps = useRef(false);
  const [bubbleMenu, setBubbleMenu] = useState<{ x: number, y: number, show: boolean }>({ x: 0, y: 0, show: false });
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [showAiPopover, setShowAiPopover] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;

    // Typewriter scrolling plugin
    const typewriterPlugin = new Plugin({
      view() {
        return {
          update(view) {
            if (!isTypewriter) return;
            const { state } = view;
            const { selection } = state;
            if (!selection.empty) return;

            const coords = view.coordsAtPos(selection.from);
            const editorRect = editorRef.current?.getBoundingClientRect();
            if (!editorRect) return;

            const viewportHeight = window.innerHeight;
            const targetY = viewportHeight / 2;
            const currentY = coords.top;
            
            const diff = currentY - targetY;
            if (Math.abs(diff) > 20) {
              const scrollContainer = editorRef.current?.parentElement;
              if (scrollContainer) {
                scrollContainer.scrollBy({ top: diff, behavior: 'smooth' });
              }
            }
          }
        };
      }
    });

    // Search highlighting plugin
    const searchPlugin = new Plugin({
      state: {
        init() { return DecorationSet.empty; },
        apply(tr, old, oldState, newState) {
          const query = tr.getMeta("searchQuery");
          const options = tr.getMeta("searchOptions");
          
          // Only re-calculate if the query, options, or document changed
          if (query === undefined && options === undefined && !tr.docChanged) {
            return old.map(tr.mapping, tr.doc);
          }

          // We need to keep track of the current query and options if we didn't receive them in this meta
          const currentQuery = query !== undefined ? query : tr.getMeta("prevSearchQuery");
          const currentOptions = options !== undefined ? options : tr.getMeta("prevSearchOptions");

          if (!currentQuery) return DecorationSet.empty;

          const flags = currentOptions?.isCaseSensitive ? 'g' : 'gi';
          let pattern = currentQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if (currentOptions?.isWholeWord) pattern = `\\b${pattern}\\b`;

          const decorations: Decoration[] = [];
          let globalMatchCount = 0;
          
          try {
            newState.doc.descendants((node, pos) => {
              if (node.isText) {
                const nodeText = node.text || "";
                let m;
                const r = new RegExp(pattern, flags);
                while ((m = r.exec(nodeText)) !== null) {
                  globalMatchCount++;
                  const start = pos + m.index;
                  const end = start + m[0].length;
                  
                  // Use the global counter to match currentMatchIndex from App.tsx
                  const isCurrent = currentOptions?.currentMatchIndex !== 0 && globalMatchCount === currentOptions?.currentMatchIndex;

                  decorations.push(Decoration.inline(start, end, {
                    class: cn(
                      "transition-all duration-300 rounded-[2px] px-[1.5px] -mx-[1.5px]",
                      isCurrent 
                        ? "bg-minimal-accent text-white shadow-[0_0_15px_rgba(var(--minimal-accent-rgb),0.8)] ring-2 ring-minimal-accent z-10 scale-[1.05] inline-block" 
                        : "bg-minimal-accent/20 border-b-2 border-minimal-accent/40"
                    )
                  }));
                }
              }
            });
          } catch (e) {}

          return DecorationSet.create(newState.doc, decorations);
        }
      },
      props: {
        decorations(state) {
          return this.getState(state);
        }
      }
    });

    const state = EditorState.create({
      doc: defaultMarkdownParser.parse(value),
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
        keymap(buildKeymap(editorSchema)),
        keymap(baseKeymap),
        buildInputRules(editorSchema),
        highlightPlugin,
        typewriterPlugin,
        searchPlugin,
        new Plugin({
          view() {
            return {
              update(view) {
                const { state } = view;
                const { from, to } = state.selection;
                
                if (from === to) {
                  setBubbleMenu(prev => ({ ...prev, show: false }));
                  return;
                }

                const start = view.coordsAtPos(from);
                const end = view.coordsAtPos(to);
                const left = (start.left + end.left) / 2;
                
                setBubbleMenu({
                  x: left,
                  y: start.top - 40,
                  show: true
                });
              }
            };
          }
        })
      ],
    });

    const view = new EditorView(editorRef.current, {
      state,
      attributes: {
        class: cn("ProseMirror", isTypewriter && "typewriter-mode"),
        "data-placeholder": placeholder || "Start writing...",
        dir: direction,
      },
      nodeViews: {
        code_block(node, view, getPos) {
          return new UmlNodeView(node, view, getPos);
        }
      },
      clipboardTextParser(text) {
        return new Slice(defaultMarkdownParser.parse(text).content, 0, 0);
      },
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        
        if (tr.docChanged && !isUpdatingFromProps.current) {
          const markdown = editorSerializer.serialize(newState.doc);
          onChange(markdown);
        }
      },
      handleKeyDown(view, event) {
        if (onKeyDown) {
          // We can't easily construct a full React.KeyboardEvent, 
          // but we can pass enough of it or just the native event.
          // Let's cast to any and pass the native event.
          onKeyDown(event as any);
        }
        return false;
      }
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []); // Only run on mount

  // Sync value from props if it changes externally (e.g. templates)
  useEffect(() => {
    if (viewRef.current && value !== editorSerializer.serialize(viewRef.current.state.doc)) {
      isUpdatingFromProps.current = true;
      const { state } = viewRef.current;
      const tr = state.tr.replaceWith(0, state.doc.content.size, defaultMarkdownParser.parse(value).content);
      viewRef.current.dispatch(tr);
      isUpdatingFromProps.current = false;
    }
  }, [value]);

  // Sync search state
  const prevSearchQuery = useRef('');
  const prevSearchOptions = useRef<any>(null);

  useEffect(() => {
    if (viewRef.current) {
      const tr = viewRef.current.state.tr;
      tr.setMeta("searchQuery", searchQuery);
      tr.setMeta("searchOptions", searchOptions);
      // Store them for the 'apply' logic to use when tr.docChanged
      tr.setMeta("prevSearchQuery", searchQuery);
      tr.setMeta("prevSearchOptions", searchOptions);
      
      viewRef.current.dispatch(tr);
      
      prevSearchQuery.current = searchQuery;
      prevSearchOptions.current = searchOptions;

      // Restore view attributes (direction, etc)
      viewRef.current.setProps({
        attributes: {
          class: cn("ProseMirror", isTypewriter && "typewriter-mode"),
          "data-placeholder": placeholder || "Start writing...",
          dir: direction,
        }
      });

      // If we have a current match, try to scroll to it
      // Note: mapping searchIndex (string index) to PM pos is approximate
      // but for basic markdown it's usually 1:1 or very close.
      if (searchQuery && searchOptions.searchIndex !== -1) {
        // We'll try to find the PM position that matches the searchIndex
        // For simplicity, we'll just scroll the view if we can find the decoration pos
        // Or just use coordsAtPos if we assume 1:1 mapping for now.
        try {
          const pos = searchOptions.searchIndex; // Naive approximation
          const coords = viewRef.current.coordsAtPos(pos);
          if (coords) {
             const editorRect = editorRef.current?.getBoundingClientRect();
             const scrollContainer = editorRef.current?.parentElement;
             if (scrollContainer && editorRect) {
               const relativeTop = coords.top - editorRect.top + scrollContainer.scrollTop;
               scrollContainer.scrollTo({
                 top: relativeTop - scrollContainer.clientHeight / 3,
                 behavior: 'smooth'
               });
             }
          }
        } catch (e) {}
      }
    }
  }, [searchQuery, searchOptions.searchIndex, searchOptions.currentMatchIndex, searchOptions.isCaseSensitive, searchOptions.isWholeWord, direction, isTypewriter, placeholder]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      viewRef.current?.focus();
    },
    insertText: (before: string, after: string = '') => {
      if (!viewRef.current) return;
      const { state, dispatch } = viewRef.current;
      const { from, to } = state.selection;
      
      // This is a bit simplified. Real markdown insertion in ProseMirror 
      // usually involves toggling marks or changing block types.
      // But we can insert raw text if we want.
      let tr = state.tr.insertText(before, from);
      tr = tr.insertText(after, to + before.length);
      dispatch(tr);
    },
    insertImage: (src: string, alt: string = '', title: string = '') => {
      if (!viewRef.current) return;
      const { state, dispatch } = viewRef.current;
      const { from } = state.selection;
      
      const node = baseSchema.nodes.image.create({ src, alt, title });
      const tr = state.tr.insert(from, node);
      dispatch(tr);
    },
    appendMarkdown: (content: string) => {
      if (!viewRef.current) return;
      const { state, dispatch } = viewRef.current;
      const parsed = defaultMarkdownParser.parse(content);
      const tr = state.tr.insert(state.doc.content.size, parsed.content);
      dispatch(tr);
      viewRef.current.focus();
    },
    replaceSelectionWithMarkdown: (content: string) => {
      if (!viewRef.current) return;
      const { state, dispatch } = viewRef.current;
      const { from, to } = state.selection;
      const parsed = defaultMarkdownParser.parse(content);
      const tr = state.tr.replaceWith(from, to, parsed.content);
      dispatch(tr);
      viewRef.current.focus();
    },
    getSelectedText: () => {
      if (!viewRef.current) return '';
      const { state } = viewRef.current;
      const { from, to } = state.selection;
      return state.doc.textBetween(from, to, ' ');
    },
    getHtml: () => {
      if (!viewRef.current) return '';
      const fragment = DOMSerializer.fromSchema(editorSchema).serializeFragment(viewRef.current.state.doc.content);
      const container = document.createElement('div');
      container.appendChild(fragment);
      return container.innerHTML;
    },
    handleFormat: (type: string) => {
      handleFormat(type);
    }
  }));

  const handleFormat = (type: string) => {
    if (!viewRef.current) return;
    const { state, dispatch } = viewRef.current;
    
    if (type === 'bold') toggleMark(editorSchema.marks.strong)(state, dispatch);
    if (type === 'italic') toggleMark(editorSchema.marks.em)(state, dispatch);
    if (type === 'underline') toggleMark(editorSchema.marks.underline)(state, dispatch);
    if (type === 'strike') toggleMark(editorSchema.marks.strike)(state, dispatch);
    if (type === 'code') toggleMark(editorSchema.marks.code)(state, dispatch);
    if (type === 'h1') setBlockType(editorSchema.nodes.heading, { level: 1 })(state, dispatch);
    if (type === 'h2') setBlockType(editorSchema.nodes.heading, { level: 2 })(state, dispatch);
    if (type === 'h3') setBlockType(editorSchema.nodes.heading, { level: 3 })(state, dispatch);
    if (type === 'quote') wrapInBlock(editorSchema.nodes.blockquote)(state, dispatch);
    
    viewRef.current.focus();
  };

  const handleAIAction = async (action: AIAssistantAction) => {
    if (!viewRef.current) return;
    const { state, dispatch } = viewRef.current;
    const { from, to } = state.selection;
    const selectedText = state.doc.textBetween(from, to, ' ');

    if (!selectedText.trim()) return;

    setIsProcessingAI(true);
    try {
      const result = await processAIAction(
        selectedText, 
        action, 
        aiPersonalInstructions, 
        selectedModel,
        (chunk) => {
          if (onAiStream) {
            onAiStream(chunk);
          }
        }
      );
      
      if (onAiResult) {
        onAiResult(result);
      } else {
        const parsed = defaultMarkdownParser.parse(result);
        const tr = state.tr.replaceWith(from, to, parsed.content);
        dispatch(tr);
      }
      
      setBubbleMenu(prev => ({ ...prev, show: false }));
      setShowAiPopover(false);
    } catch (error) {
      console.error("AI Action failed:", error);
      alert("Failed to process AI request. Check console for details.");
    } finally {
      setIsProcessingAI(false);
    }
  };

  const wrapInBlock = (type: any) => (state: EditorState, dispatch: any) => {
     return setBlockType(type)(state, dispatch);
  };

  return (
    <div ref={containerRef} className={cn("relative h-full flex flex-col", className)}>
      <AnimatePresence>
        {bubbleMenu.show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            style={{ 
              position: 'fixed',
              left: bubbleMenu.x,
              top: bubbleMenu.y,
              transform: 'translateX(-50%)'
            }}
            className="z-[100] flex items-center gap-1 bg-zinc-900 border border-zinc-700/50 rounded-lg p-1 shadow-2xl backdrop-blur"
          >
            <button
              onClick={() => handleFormat('h1')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Heading 1"
            >
              <Heading1 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFormat('h2')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Heading 2"
            >
              <Heading2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFormat('h3')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Heading 3"
            >
              <Heading3 className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            <button
              onClick={() => handleFormat('bold')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Bold"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFormat('italic')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Italic"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFormat('underline')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Underline"
            >
              <Underline className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFormat('strike')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Strikethrough"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleFormat('code')}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Code"
            >
              <Code className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            <button
              onClick={() => {
                const url = window.prompt("Enter URL:");
                if (url && viewRef.current) {
                  const { state, dispatch } = viewRef.current;
                  toggleMark(baseSchema.marks.link, { href: url })(state, dispatch);
                }
              }}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Link"
            >
              <Link className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (onImageUploadRequest) {
                  onImageUploadRequest();
                } else {
                  const url = window.prompt("Enter Image URL:");
                  if (url && viewRef.current) {
                    const { state, dispatch } = viewRef.current;
                    const { from } = state.selection;
                    const node = baseSchema.nodes.image.create({ src: url, alt: "Image" });
                    dispatch(state.tr.insert(from, node));
                  }
                }
              }}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Insert Image"
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            
            <button
              onClick={() => handleAIAction('improve')}
              disabled={isProcessingAI}
              className="p-1.5 hover:bg-minimal-accent/20 text-minimal-accent rounded transition-colors"
              title="Improve Flow"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleAIAction('draft-topic')}
              disabled={isProcessingAI}
              className="p-1.5 hover:bg-minimal-accent/20 text-minimal-accent rounded transition-colors"
              title="Draft Topic"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-3 bg-white/20 mx-0.5" />

            <div className="relative">
              <button
                onClick={() => setShowAiPopover(!showAiPopover)}
                disabled={isProcessingAI}
                className={cn(
                  "p-1.5 rounded transition-all flex items-center gap-1",
                  isProcessingAI ? "text-zinc-500 cursor-not-allowed" : "hover:bg-minimal-accent/20 text-minimal-accent",
                  showAiPopover && "bg-minimal-accent/20"
                )}
                title="AI Writing Assistant"
              >
                {isProcessingAI ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </motion.div>
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider">AI</span>
              </button>

              <AnimatePresence>
                {showAiPopover && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl p-2 flex flex-col gap-1 w-48"
                  >
                    <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pe-1 custom-scrollbar">
                      <div className="px-2 py-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800/50 rounded-t-lg mb-1">Editing</div>
                      {[
                        { id: 'improve', label: 'Improve Writing', icon: Wand2 },
                        { id: 'fix-grammar', label: 'Fix Grammar', icon: CheckCheck },
                        { id: 'shorten', label: 'Make Shorter', icon: Minimize2 },
                        { id: 'expand', label: 'Expand Selection', icon: Maximize2 },
                      ].map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleAIAction(item.id as AIAssistantAction)}
                          className="flex items-center gap-2 p-2 hover:bg-white/10 rounded-lg text-left transition-colors"
                        >
                          <item.icon className="w-3.5 h-3.5 text-minimal-accent" />
                          <span className="text-xs text-zinc-300 font-medium">{item.label}</span>
                        </button>
                      ))}

                      <div className="px-2 py-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800/50 mt-1 mb-1">Structure</div>
                      {[
                        { id: 'generate-outline', label: 'Create Outline', icon: Layout },
                        { id: 'expand-outline', label: 'Draft from Outline', icon: Zap },
                        { id: 'draft-topic', label: 'Draft Topic', icon: ArrowRight },
                        { id: 'summarize', label: 'Summarize', icon: FileText },
                        { id: 'suggest-title', label: 'Suggest Titles', icon: Heading },
                      ].map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleAIAction(item.id as AIAssistantAction)}
                          className="flex items-center gap-2 p-2 hover:bg-white/10 rounded-lg text-left transition-colors"
                        >
                          <item.icon className="w-3.5 h-3.5 text-minimal-accent" />
                          <span className="text-xs text-zinc-300 font-medium">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div 
        ref={editorRef} 
        className="flex-1"
      />
    </div>
  );
});

export default ProseMirrorEditor;
