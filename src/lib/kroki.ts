import pako from 'pako';

export const encodeDiagram = (source: string): string => {
  const data = new TextEncoder().encode(source);
  const compressed = pako.deflate(data, { level: 9 });
  const result = btoa(String.fromCharCode.apply(null, Array.from(compressed)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return result;
};

export const getKrokiUrl = (type: string, source: string): string => {
  if (!source.trim()) return '';
  const encoded = encodeDiagram(source);
  // Supported types: mermaid, plantuml, graphviz, ditaa, erd, blockdiag, c4plantuml, etc.
  const normalizedType = type.toLowerCase();
  return `https://kroki.io/${normalizedType}/svg/${encoded}`;
};
