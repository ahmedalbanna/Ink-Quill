import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Schema, DOMParser, DOMSerializer, Slice } from 'prosemirror-model';
import { schema as baseSchema } from 'prosemirror-markdown';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, setBlockType, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { buildInputRules, buildKeymap } from './prose-setup';
import { highlightPlugin } from './prose-highlight';
import { defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { 
  Bold, 
  Italic, 
  Link, 
  Code, 
  Quote, 
  Type, 
  Sparkles, 
  Wand2, 
  CheckCheck, 
  AlignLeft, 
  ArrowRight, 
  Image as ImageIcon,
  Heading,
  Minimize2,
  Maximize2,
  Smile,
  User,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { processAIAction, type AIAssistantAction } from '../services/geminiService';
import { getKrokiUrl } from '../lib/kroki';

// We'll use a slightly customized schema if needed, but prosemirror-markdown's schema is a good start.

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
  aiPersonalInstructions?: string;
}

export interface EditorRef {
  focus: () => void;
  insertText: (before: string, after?: string) => void;
  insertImage: (src: string, alt?: string, title?: string) => void;
}

const ProseMirrorEditor = forwardRef<EditorRef, Props>(({ value, onChange, onKeyDown, className, placeholder, isTypewriter, aiPersonalInstructions }, ref) => {
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

    const state = EditorState.create({
      doc: defaultMarkdownParser.parse(value),
      plugins: [
        history(),
        keymap({
          "Mod-z": undo,
          "Mod-y": redo,
          "Mod-Shift-z": redo,
        }),
        keymap(buildKeymap(baseSchema)),
        keymap(baseKeymap),
        buildInputRules(baseSchema),
        highlightPlugin,
        typewriterPlugin,
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
          const markdown = defaultMarkdownSerializer.serialize(newState.doc);
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
    if (viewRef.current && value !== defaultMarkdownSerializer.serialize(viewRef.current.state.doc)) {
      isUpdatingFromProps.current = true;
      const { state } = viewRef.current;
      const tr = state.tr.replaceWith(0, state.doc.content.size, defaultMarkdownParser.parse(value).content);
      viewRef.current.dispatch(tr);
      isUpdatingFromProps.current = false;
    }
  }, [value]);

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
    }
  }));

  const handleFormat = (type: string) => {
    if (!viewRef.current) return;
    const { state, dispatch } = viewRef.current;
    
    if (type === 'bold') toggleMark(baseSchema.marks.strong)(state, dispatch);
    if (type === 'italic') toggleMark(baseSchema.marks.em)(state, dispatch);
    if (type === 'code') toggleMark(baseSchema.marks.code)(state, dispatch);
    if (type === 'quote') wrapInBlock(baseSchema.nodes.blockquote)(state, dispatch);
    
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
      const result = await processAIAction(selectedText, action, aiPersonalInstructions);
      
      const parsed = defaultMarkdownParser.parse(result);
      const tr = state.tr.replaceWith(from, to, parsed.content);
      
      dispatch(tr);
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
                const url = window.prompt("Enter Image URL:");
                if (url && viewRef.current) {
                  const { state, dispatch } = viewRef.current;
                  const { from } = state.selection;
                  const node = baseSchema.nodes.image.create({ src: url, alt: "Image" });
                  dispatch(state.tr.insert(from, node));
                }
              }}
              className="p-1.5 hover:bg-white/10 rounded text-white transition-colors"
              title="Insert Image"
            >
              <ImageIcon className="w-3.5 h-3.5" />
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
                    <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
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

                      <div className="px-2 py-1.5 text-[9px] font-bold text-zinc-500 uppercase tracking-widest bg-zinc-800/50 mt-1 mb-1">Tone & Structure</div>
                      {[
                        { id: 'tone-professional', label: 'Formal Tone', icon: User },
                        { id: 'tone-casual', label: 'Casual Tone', icon: Smile },
                        { id: 'summarize', label: 'Summarize', icon: AlignLeft },
                        { id: 'expand-outline', label: 'Draft from Outline', icon: Zap },
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
