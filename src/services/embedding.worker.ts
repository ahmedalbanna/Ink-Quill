import { pipeline, env } from '@xenova/transformers';

// Configuration for Transformers.js
env.allowLocalModels = false;
env.useBrowserCache = typeof self !== 'undefined' && 'caches' in self;

let extractor: any = null;
const modelName = 'Xenova/all-MiniLM-L6-v2';

async function getExtractor(progressCallback?: (data: any) => void) {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', modelName, {
      progress_callback: progressCallback
    });
  }
  return extractor;
}

self.onmessage = async (event) => {
  const { type, text, id, model } = event.data;

  try {
    if (type === 'init') {
      // Just check if we have the model (or if we can check without full load)
      // For simplicity, we'll just report that we're alive.
      self.postMessage({ type: 'worker-ready' });
      return;
    }

    if (type === 'load-model') {
      await getExtractor((progress) => {
        self.postMessage({ type: 'progress', progress });
      });
      self.postMessage({ type: 'model-ready' });
      return;
    }

    if (type === 'embed') {
      const ext = await getExtractor();
      const output = await ext(text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data as any);
      self.postMessage({ type: 'embedding', embedding, id });
    }
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error), id });
  }
};
