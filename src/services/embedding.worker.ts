import { pipeline, env } from '@xenova/transformers';

// Configuration for Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = typeof self !== 'undefined' && 'caches' in self;

let extractor: any = null;
const modelName = 'Xenova/all-MiniLM-L6-v2';

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', modelName);
  }
  return extractor;
}

self.onmessage = async (event) => {
  const { type, text, id } = event.data;

  try {
    if (type === 'init') {
      await getExtractor();
      self.postMessage({ type: 'ready' });
      return;
    }

    if (type === 'embed') {
      const ext = await getExtractor();
      const output = await ext(text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);
      self.postMessage({ type: 'embedding', embedding, id });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error), id });
  }
};
