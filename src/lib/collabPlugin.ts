import * as Y from 'yjs';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror';
import { keymap } from 'prosemirror-keymap';
import { Plugin } from 'prosemirror-state';

import { Awareness } from 'y-protocols/awareness';

export interface CollabConfig {
  docId: string;
  username?: string;
  color?: string;
}

export function createCollabPlugin(config: CollabConfig) {
  const ydoc = new Y.Doc();
  const type = ydoc.getXmlFragment('prosemirror');
  
  // Local awareness for cursors
  const awareness = new Awareness(ydoc);
  
  awareness.setLocalStateField('user', {
    name: config.username || 'Anonymous Writer',
    color: config.color || '#' + Math.floor(Math.random() * 16777215).toString(16)
  });

  // Sync across tabs using BroadcastChannel (simple local collab)
  const channel = new BroadcastChannel(`ink-quill-collab-${config.docId}`);
  
  ydoc.on('update', (update: Uint8Array) => {
    channel.postMessage(update);
  });

  channel.onmessage = (event) => {
    if (event.data instanceof Uint8Array) {
      Y.applyUpdate(ydoc, event.data);
    }
  };

  const plugins: Plugin[] = [
    ySyncPlugin(type),
    yCursorPlugin(awareness),
    yUndoPlugin(),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo
    })
  ];

  return {
    plugins,
    ydoc,
    type,
    awareness
  };
}
