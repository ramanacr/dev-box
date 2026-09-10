import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceStore, StorageUnavailableError } from './workspaceStore';
import { openDB } from 'idb';

describe('WorkspaceStore', () => {
  beforeEach(async () => {
    await WorkspaceStore.clear();
  });

  it('stores and retrieves items with toolbox/v1/ namespace prefix', async () => {
    await WorkspaceStore.set('docs/recent-query', { query: 'rebase' });

    const val = await WorkspaceStore.get<{ query: string }>('docs/recent-query');
    expect(val).toEqual({ query: 'rebase' });

    // Verify low-level namespace key in IndexedDB
    const rawDb = await openDB('toolbox-db', 1);
    const rawVal = await rawDb.get('workspace', 'toolbox/v1/docs/recent-query');
    expect(rawVal).toEqual({ query: 'rebase' });
  });

  it('overwrites existing values cleanly', async () => {
    await WorkspaceStore.set('data/draft', 'initial');
    await WorkspaceStore.set('data/draft', 'updated');

    const result = await WorkspaceStore.get<string>('data/draft');
    expect(result).toBe('updated');
  });

  it('deletes stored items', async () => {
    await WorkspaceStore.set('temp', 123);
    expect(await WorkspaceStore.get<number>('temp')).toBe(123);

    await WorkspaceStore.delete('temp');
    expect(await WorkspaceStore.get<number>('temp')).toBeUndefined();
  });

  it('returns undefined for non-existent keys', async () => {
    const val = await WorkspaceStore.get('nonexistent');
    expect(val).toBeUndefined();
  });
});
