import { describe, it, expect, beforeEach } from 'vitest';
import { DiagramStore, type SavedDiagram } from './diagramStore';
import { WorkspaceStore } from '@/platform/storage/workspaceStore';

describe('DiagramStore', () => {
  beforeEach(async () => {
    await WorkspaceStore.clear();
  });

  it('saves and retrieves diagram definitions round-trip', async () => {
    const diagram: SavedDiagram = {
      id: 'diag-1',
      kind: 'mermaid',
      title: 'Architecture Overview',
      source: 'graph TD; A-->B;',
      updatedAt: new Date().toISOString(),
    };

    await DiagramStore.saveWithIndex(diagram);
    const fetched = await DiagramStore.get('diag-1');
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe('Architecture Overview');
    expect(fetched?.source).toBe('graph TD; A-->B;');

    const list = await DiagramStore.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('diag-1');
  });


  it('deletes diagrams and updates index', async () => {
    const diagram: SavedDiagram = {
      id: 'diag-2',
      kind: 'excalidraw',
      title: 'Sketch 1',
      source: '{"type":"excalidraw","elements":[]}',
      updatedAt: new Date().toISOString(),
    };

    await DiagramStore.saveWithIndex(diagram);
    expect(await DiagramStore.list()).toHaveLength(1);

    await DiagramStore.deleteWithIndex('diag-2');
    expect(await DiagramStore.list()).toHaveLength(0);
    expect(await DiagramStore.get('diag-2')).toBeUndefined();
  });

  it('validates .excalidraw JSON shape safely', () => {
    expect(DiagramStore.validateExcalidrawJson('{"type":"excalidraw","elements":[]}')).toBe(true);
    expect(DiagramStore.validateExcalidrawJson('{"elements":[{"id":"1"}]}')).toBe(true);
    expect(DiagramStore.validateExcalidrawJson('{"invalid":"json"}')).toBe(false);
    expect(DiagramStore.validateExcalidrawJson('not a json')).toBe(false);
  });
});
