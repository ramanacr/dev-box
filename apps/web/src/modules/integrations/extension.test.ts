import { describe, it, expect, vi } from 'vitest';
import { activate, type VSCodeContext } from './extension';

describe('VS Code Extension Integration', () => {
  it('registers command and opens local toolbox URL with encoded query', async () => {
    const mockOpenExternal = vi.fn().mockResolvedValue(true);
    const mockContext: VSCodeContext = { subscriptions: [] };

    const ext = activate(mockContext, mockOpenExternal);
    expect(mockContext.subscriptions.length).toBe(1);

    const opened = await ext.searchDocsInToolbox('useState React');
    expect(opened).toBe(true);
    expect(mockOpenExternal).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/docs?q=useState%20React'
    );
  });

  it('ignores empty search query', async () => {
    const mockOpenExternal = vi.fn().mockResolvedValue(true);
    const mockContext: VSCodeContext = { subscriptions: [] };

    const ext = activate(mockContext, mockOpenExternal);
    const opened = await ext.searchDocsInToolbox('   ');
    expect(opened).toBe(false);
    expect(mockOpenExternal).not.toHaveBeenCalled();
  });
});
