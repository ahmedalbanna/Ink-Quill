import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from '../stores/editorStore';
import { snapshotService } from '../services/snapshotService';

// Mock snapshotService
vi.mock('../services/snapshotService', () => ({
  snapshotService: {
    saveSnapshot: vi.fn().mockImplementation((content) => Promise.resolve({
      id: 'test-id',
      timestamp: Date.now(),
      content,
      wordCount: content.split(/\s+/).length
    })),
    getSnapshots: vi.fn().mockResolvedValue([]),
    clearAllSnapshots: vi.fn().mockResolvedValue(undefined),
  }
}));

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      content: '# Welcome to Ink & Quill\n\nStart writing...',
      cursor: null,
      history: { past: [], future: [] },
      snapshots: [],
      wordGoal: 0,
    });
    vi.clearAllMocks();
  });

  it('should update content', () => {
    const { setContent } = useEditorStore.getState();
    setContent('New content');
    expect(useEditorStore.getState().content).toBe('New content');
  });

  it('should support functional updates for content', () => {
    const { setContent } = useEditorStore.getState();
    setContent((prev) => prev + ' added');
    expect(useEditorStore.getState().content).toBe('# Welcome to Ink & Quill\n\nStart writing... added');
  });

  it('should add snapshots', async () => {
    const { addSnapshot } = useEditorStore.getState();
    await addSnapshot('Snapshot 1');
    expect(useEditorStore.getState().snapshots.length).toBe(1);
    expect(useEditorStore.getState().snapshots[0].content).toBe('Snapshot 1');
    expect(snapshotService.saveSnapshot).toHaveBeenCalledWith('Snapshot 1', undefined);
  });

  it('should set word goal', () => {
    const { setWordGoal } = useEditorStore.getState();
    setWordGoal(1000);
    expect(useEditorStore.getState().wordGoal).toBe(1000);
  });
});
