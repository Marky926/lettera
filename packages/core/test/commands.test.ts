import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  createEmptyDocument,
  type EmailDocument,
  makeBlock,
  registerStandardCommands,
} from '../src/index.js';

function setup() {
  const doc = createEmptyDocument('Test');
  const bus = new CommandBus<EmailDocument>(doc);
  registerStandardCommands(bus);
  const colId = doc.root[0]!.children[0]!.children[0]!.id;
  return { bus, colId };
}

describe('command bus', () => {
  it('inserts a block and undo/redo round-trips', () => {
    const { bus, colId } = setup();
    const block = makeBlock('block.text', { html: '<p>Hi</p>', styleRef: 'body' });

    bus.dispatch('doc/insertBlock', { parentId: colId, block });
    expect(bus.getState().root[0]!.children[0]!.children[0]!.children).toHaveLength(1);

    bus.undo();
    expect(bus.getState().root[0]!.children[0]!.children[0]!.children).toHaveLength(0);

    bus.redo();
    expect(bus.getState().root[0]!.children[0]!.children[0]!.children).toHaveLength(1);
  });

  it('coalesces consecutive style edits on the same node', () => {
    const { bus, colId } = setup();
    const block = makeBlock('block.heading', {
      level: 1,
      html: 'Hello',
      styleRef: 'h1',
    });
    bus.dispatch('doc/insertBlock', { parentId: colId, block });
    const id = block.id;

    bus.dispatch('doc/updateStyles', { id, styles: { color: '#111' } });
    bus.dispatch('doc/updateStyles', { id, styles: { color: '#222' } });
    bus.dispatch('doc/updateStyles', { id, styles: { color: '#333' } });

    // Insert + one coalesced styles entry.
    expect(bus.history()).toHaveLength(2);

    bus.undo(); // undoes ALL three style edits at once
    const found = bus.getState().root[0]!.children[0]!.children[0]!.children[0]!;
    expect((found as { styles?: { color?: string } }).styles?.color).toBeUndefined();
  });
});
