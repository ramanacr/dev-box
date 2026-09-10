import { WorkspaceStore } from '@/platform/storage/workspaceStore';

export interface SavedDiagram {
  id: string;
  kind: 'excalidraw' | 'mermaid';
  title: string;
  source: string;
  updatedAt: string;
}

const DIAGRAM_PREFIX = 'diagrams/';

export const DiagramStore = {
  async save(id: string, diagram: SavedDiagram): Promise<void> {
    await WorkspaceStore.set(`${DIAGRAM_PREFIX}${id}`, diagram);
  },

  async get(id: string): Promise<SavedDiagram | undefined> {
    return await WorkspaceStore.get<SavedDiagram>(`${DIAGRAM_PREFIX}${id}`);
  },

  async delete(id: string): Promise<void> {
    await WorkspaceStore.delete(`${DIAGRAM_PREFIX}${id}`);
  },

  async list(): Promise<SavedDiagram[]> {
    // Collect all diagrams from the workspace
    // If not directly enumerable in simple store, we maintain an index of diagram IDs
    const index = (await WorkspaceStore.get<string[]>('diagrams_index')) || [];
    const list: SavedDiagram[] = [];
    for (const id of index) {
      const d = await WorkspaceStore.get<SavedDiagram>(`${DIAGRAM_PREFIX}${id}`);
      if (d) list.push(d);
    }
    return list;
  },

  async saveWithIndex(diagram: SavedDiagram): Promise<void> {
    await this.save(diagram.id, diagram);
    const index = (await WorkspaceStore.get<string[]>('diagrams_index')) || [];
    if (!index.includes(diagram.id)) {
      index.push(diagram.id);
      await WorkspaceStore.set('diagrams_index', index);
    }
  },

  async deleteWithIndex(id: string): Promise<void> {
    await this.delete(id);
    const index = (await WorkspaceStore.get<string[]>('diagrams_index')) || [];
    const filtered = index.filter((i) => i !== id);
    await WorkspaceStore.set('diagrams_index', filtered);
  },

  validateExcalidrawJson(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') return false;
      return Boolean(
        data.type === 'excalidraw' ||
        Array.isArray(data.elements) ||
        (typeof data.source === 'string' && data.source.includes('excalidraw'))
      );
    } catch {
      return false;
    }

  },
};
