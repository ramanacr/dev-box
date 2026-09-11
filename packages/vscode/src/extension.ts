/**
 * Developer Toolbox VS Code Integration Entrypoint
 */

export interface VSCodeContext {
  subscriptions: Array<{ dispose(): any }>;
}

export function activate(context: VSCodeContext, openExternal: (url: string) => Promise<boolean>) {
  const disposable = {
    dispose: () => {},
  };
  context.subscriptions.push(disposable);

  return {
    searchDocsInToolbox: async (selectedQuery: string, baseUrl = 'http://127.0.0.1:8080') => {
      const trimmed = selectedQuery.trim();
      if (!trimmed) return false;
      const targetUrl = `${baseUrl}/docs?q=${encodeURIComponent(trimmed)}`;
      return await openExternal(targetUrl);
    },
  };
}
