import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wand2, 
  Layout, 
  FileText, 
  Heading1, 
  Heading2, 
  List, 
  Code,
  Image as ImageIcon,
  CheckCheck,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SlashMenuItem {
  id: string;
  label: string;
  description: string;
  icon: any;
  action: string;
}

const ITEMS: SlashMenuItem[] = [
  { id: 'h1', label: 'Heading 1', description: 'Large section heading', icon: Heading1, action: 'h1' },
  { id: 'h2', label: 'Heading 2', description: 'Medium section heading', icon: Heading2, action: 'h2' },
  { id: 'bullet', label: 'Bullet List', description: 'Simple bulleted list', icon: List, action: 'bullet' },
  { id: 'code', label: 'Code Block', description: 'Code with syntax highlighting', icon: Code, action: 'code' },
  { id: 'image', label: 'Image', description: 'Insert or upload an image', icon: ImageIcon, action: 'image' },
  { id: 'ai-improve', label: 'AI Improve', description: 'Rewrite the paragraph', icon: Wand2, action: 'ai-improve' },
  { id: 'ai-outline', label: 'AI Outline', description: 'Generate structure', icon: Layout, action: 'ai-outline' },
  { id: 'ai-summarize', label: 'AI Summarize', description: 'Sum up previous section', icon: FileText, action: 'ai-summarize' },
  { id: 'ai-draft', label: 'AI Draft', description: 'Continue writing from here', icon: Zap, action: 'ai-draft' },
];

interface Props {
  x: number;
  y: number;
  onSelect: (action: string) => void;
  onClose: () => void;
}

export const SlashMenu: React.FC<Props> = ({ x, y, onSelect, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % ITEMS.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + ITEMS.length) % ITEMS.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(ITEMS[selectedIndex].action);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedIndex, onSelect, onClose]);

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      style={{ position: 'fixed', left: x, top: y }}
      className="z-[200] w-64 bg-minimal-bg border border-minimal-border rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden"
    >
      <div className="p-2 border-b border-minimal-border bg-minimal-sidebar/50">
        <span className="text-[10px] font-bold text-minimal-muted uppercase tracking-widest px-2">Actions</span>
      </div>
      <div className="max-h-80 overflow-y-auto p-1 custom-scrollbar">
        {ITEMS.map((item, index) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.action)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left",
              index === selectedIndex ? "bg-minimal-accent text-white shadow-lg shadow-minimal-accent/20" : "hover:bg-minimal-sidebar"
            )}
          >
            <div className={cn(
              "p-2 rounded-lg",
              index === selectedIndex ? "bg-white/20" : "bg-minimal-sidebar border border-minimal-border"
            )}>
              <item.icon className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-bold truncate">{item.label}</span>
              <span className={cn(
                "text-[10px] truncate",
                index === selectedIndex ? "text-white/70" : "text-minimal-muted"
              )}>{item.description}</span>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
};
