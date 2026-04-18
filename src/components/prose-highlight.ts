import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import hljs from "highlight.js";

const highlightKey = new PluginKey("highlight");

function getDecorations(doc: any) {
  const decorations: any[] = [];
  
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === "code_block") {
      const lang = node.attrs.params || "";
      const text = node.textContent;
      let result;

      try {
        if (lang && hljs.getLanguage(lang)) {
          result = hljs.highlight(text, { language: lang });
        } else {
          result = hljs.highlightAuto(text);
        }
      } catch (e) {
        return;
      }

      if (result && result.value) {
        // Simple HTML to Decoration mapping
        // We parse the HTML result from hljs
        // HLJS output looks like: <span class="hljs-keyword">const</span> ...
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = result.value;

        let offset = pos + 1;
        const processNode = (htmlNode: Node) => {
          if (htmlNode.nodeType === Node.TEXT_NODE) {
            offset += (htmlNode.textContent?.length || 0);
          } else if (htmlNode.nodeType === Node.ELEMENT_NODE) {
            const el = htmlNode as HTMLElement;
            const start = offset;
            el.childNodes.forEach(processNode);
            const end = offset;
            
            if (el.className) {
              decorations.push(Decoration.inline(start, end, { class: el.className }));
            }
          }
        };

        tempDiv.childNodes.forEach(processNode);
        
        // Add a class to the whole block with the language name
        if (lang) {
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { 
            class: `hljs-language-${lang}`,
            "data-language": lang 
          }));
        }
      }
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const highlightPlugin = new Plugin({
  key: highlightKey,
  state: {
    init(_, { doc }) {
      return getDecorations(doc);
    },
    apply(tr, set) {
      if (!tr.docChanged) return set;
      return getDecorations(tr.doc);
    }
  },
  props: {
    decorations(state) {
      return this.getState(state);
    }
  }
});
