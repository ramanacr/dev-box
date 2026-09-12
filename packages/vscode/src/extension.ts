/**
 * Developer Toolbox VS Code extension.
 *
 * Scope is deliberately narrow: it hands the current selection to the local toolbox
 * in the user's browser. It does not inject a webview, does not embed the toolbox UI,
 * and does not touch the API workbench or its environment variables — those hold
 * request secrets and belong behind the browser's consent prompts.
 *
 * The activation entry point is kept thin so the routing logic below can be tested
 * without a VS Code instance.
 */

/** The slice of the VS Code API this extension uses. */
export interface VSCodeApi {
  window: {
    activeTextEditor?: {
      document: { getText(range?: unknown): string };
      selection: { isEmpty: boolean };
    };
    showWarningMessage(message: string): unknown;
    showErrorMessage(message: string): unknown;
    showInputBox(options: { prompt: string; placeHolder?: string }): Promise<string | undefined>;
  };
  env: {
    openExternal(target: unknown): Promise<boolean>;
  };
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): { dispose(): void };
  };
  workspace: {
    getConfiguration(section: string): { get<T>(key: string, fallback: T): T };
  };
  Uri: {
    parse(value: string): unknown;
  };
}

export interface VSCodeContext {
  subscriptions: Array<{ dispose(): unknown }>;
}

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Restricts the configured base URL to the local machine.
 *
 * The setting is workspace-configurable, and a workspace is untrusted input: a
 * committed `.vscode/settings.json` could otherwise point the command at an
 * attacker's host and have the editor open it with the user's selected code in the
 * query string.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  return LOOPBACK_HOSTNAMES.has(hostname) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/** Caps how much text is placed in a URL, and normalises whitespace. */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Builds the docs URL for a query.
 *
 * Exported for tests: the encoding is the part that must not break on characters
 * common in code selections (`&`, `?`, `#`, `+`).
 */
export function buildDocsUrl(baseUrl: string, query: string): string {
  const url = new URL('/docs', baseUrl);
  url.searchParams.set('q', query);
  return url.toString();
}

export interface ActivateResult {
  searchDocsInToolbox(selectedQuery: string, baseUrl?: string): Promise<boolean>;
}

export function activate(
  context: VSCodeContext,
  api: VSCodeApi | ((url: string) => Promise<boolean>),
): ActivateResult {
  // The original signature took a bare openExternal function. Keep it working so the
  // unit tests and any existing host wiring do not break.
  const openExternal =
    typeof api === 'function' ? api : (url: string) => api.env.openExternal(api.Uri.parse(url));

  const configuredBaseUrl = () => {
    if (typeof api === 'function') return DEFAULT_BASE_URL;
    return api.workspace.getConfiguration('developerToolbox').get('url', DEFAULT_BASE_URL);
  };

  const searchDocsInToolbox = async (
    selectedQuery: string,
    baseUrl: string = configuredBaseUrl(),
  ): Promise<boolean> => {
    const query = normalizeQuery(selectedQuery ?? '');
    if (!query) {
      if (typeof api !== 'function') {
        api.window.showWarningMessage('Select some text to look up in Developer Toolbox.');
      }
      return false;
    }

    if (!isLocalBaseUrl(baseUrl)) {
      if (typeof api !== 'function') {
        api.window.showErrorMessage(
          'Developer Toolbox must be a local address (localhost or 127.0.0.0/8). Check the developerToolbox.url setting.',
        );
      }
      return false;
    }

    return openExternal(buildDocsUrl(baseUrl, query));
  };

  if (typeof api !== 'function') {
    const disposable = api.commands.registerCommand('developerToolbox.searchDocs', async () => {
      const editor = api.window.activeTextEditor;

      let query = '';
      if (editor && !editor.selection.isEmpty) {
        query = editor.document.getText(editor.selection);
      } else {
        query = (await api.window.showInputBox({
          prompt: 'Search Developer Toolbox documentation',
          placeHolder: 'e.g. dependency injection',
        })) ?? '';
      }

      await searchDocsInToolbox(query);
    });

    context.subscriptions.push(disposable);
  } else {
    context.subscriptions.push({ dispose: () => {} });
  }

  return { searchDocsInToolbox };
}

export function deactivate(): void {
  // Nothing to tear down: no webview, no server, no background task.
}
