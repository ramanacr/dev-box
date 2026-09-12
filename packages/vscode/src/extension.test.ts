import { describe, it, expect, vi } from 'vitest';
import {
  activate,
  buildDocsUrl,
  deactivate,
  isLocalBaseUrl,
  normalizeQuery,
  type VSCodeApi,
  type VSCodeContext,
} from './extension';

/** A test double for the slice of the VS Code API the extension uses. */
function fakeApi(overrides: Partial<VSCodeApi> = {}) {
  const openExternal = vi.fn().mockResolvedValue(true);
  const showWarningMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const showInputBox = vi.fn().mockResolvedValue(undefined);
  const registered = new Map<string, (...args: unknown[]) => unknown>();

  const api: VSCodeApi = {
    window: {
      showWarningMessage,
      showErrorMessage,
      showInputBox,
      ...(overrides.window ?? {}),
    } as VSCodeApi['window'],
    env: { openExternal },
    commands: {
      registerCommand: (command, callback) => {
        registered.set(command, callback);
        return { dispose: () => registered.delete(command) };
      },
    },
    workspace: {
      getConfiguration: () => ({
        get: <T,>(_key: string, fallback: T) => fallback,
      }),
      ...(overrides.workspace ?? {}),
    } as VSCodeApi['workspace'],
    Uri: { parse: (value: string) => value },
    ...(overrides.env ? { env: overrides.env } : {}),
  };

  return { api, openExternal, showWarningMessage, showErrorMessage, showInputBox, registered };
}

function context(): VSCodeContext {
  return { subscriptions: [] };
}

describe('normalizeQuery', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeQuery('  dependency \n\t injection  ')).toBe('dependency injection');
  });

  it('caps length so a whole file cannot be pushed into a URL', () => {
    expect(normalizeQuery('a'.repeat(500))).toHaveLength(200);
  });

  it('returns an empty string for whitespace only', () => {
    expect(normalizeQuery('   \n  ')).toBe('');
  });
});

describe('buildDocsUrl', () => {
  it('encodes characters that are common in code selections', () => {
    const url = buildDocsUrl('http://127.0.0.1:8080', 'a & b ? c # d + e/f');
    expect(url).toContain('/docs?q=');
    // The query must survive intact rather than truncating at & or #.
    expect(new URL(url).searchParams.get('q')).toBe('a & b ? c # d + e/f');
  });

  it('targets the docs route', () => {
    expect(buildDocsUrl('http://localhost:8080', 'x')).toBe('http://localhost:8080/docs?q=x');
  });
});

describe('isLocalBaseUrl', () => {
  it('accepts loopback addresses', () => {
    for (const url of [
      'http://127.0.0.1:8080',
      'http://localhost:8080',
      'http://127.0.0.9:3000',
      'https://localhost:8443',
    ]) {
      expect(isLocalBaseUrl(url)).toBe(true);
    }
  });

  it('rejects remote and non-http addresses', () => {
    for (const url of [
      'http://10.0.0.5:8080',
      'https://toolbox.evil.example.com',
      'file:///etc/passwd',
      'not-a-url',
      '',
    ]) {
      expect(isLocalBaseUrl(url)).toBe(false);
    }
  });
});

describe('activate', () => {
  it('registers the documentation command', () => {
    const { api, registered } = fakeApi();
    const ctx = context();

    activate(ctx, api);

    expect(registered.has('developerToolbox.searchDocs')).toBe(true);
    expect(ctx.subscriptions).toHaveLength(1);
  });

  it('opens the toolbox with the selection using openExternal', async () => {
    const { api, openExternal } = fakeApi();
    const result = activate(context(), api);

    await expect(result.searchDocsInToolbox('dependency injection')).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith('http://127.0.0.1:8080/docs?q=dependency+injection');
  });

  it('does nothing for an empty selection and warns the user', async () => {
    const { api, openExternal, showWarningMessage } = fakeApi();
    const result = activate(context(), api);

    await expect(result.searchDocsInToolbox('   ')).resolves.toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
    expect(showWarningMessage).toHaveBeenCalled();
  });

  // A workspace-supplied setting is untrusted; it must not be able to send the
  // user's selected code to an arbitrary host.
  it('refuses a non-local base URL', async () => {
    const { api, openExternal, showErrorMessage } = fakeApi();
    const result = activate(context(), api);

    await expect(
      result.searchDocsInToolbox('secret code', 'https://attacker.example.com'),
    ).resolves.toBe(false);
    expect(openExternal).not.toHaveBeenCalled();
    expect(showErrorMessage).toHaveBeenCalled();
  });

  it('reads the base URL from configuration', async () => {
    const { api, openExternal } = fakeApi({
      workspace: {
        getConfiguration: () => ({ get: <T,>(_k: string, _f: T) => 'http://localhost:9999' as T }),
      } as VSCodeApi['workspace'],
    });
    const result = activate(context(), api);

    await result.searchDocsInToolbox('hooks');
    expect(openExternal).toHaveBeenCalledWith('http://localhost:9999/docs?q=hooks');
  });

  it('uses the editor selection when the command runs', async () => {
    const { api, openExternal, registered } = fakeApi({
      window: {
        activeTextEditor: {
          document: { getText: () => 'IServiceCollection' },
          selection: { isEmpty: false },
        },
        showWarningMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showInputBox: vi.fn(),
      } as unknown as VSCodeApi['window'],
    });

    activate(context(), api);
    await registered.get('developerToolbox.searchDocs')?.();

    expect(openExternal).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/docs?q=IServiceCollection',
    );
  });

  it('prompts for input when there is no selection', async () => {
    const showInputBox = vi.fn().mockResolvedValue('rebase');
    const { api, openExternal, registered } = fakeApi({
      window: {
        showWarningMessage: vi.fn(),
        showErrorMessage: vi.fn(),
        showInputBox,
      } as unknown as VSCodeApi['window'],
    });

    activate(context(), api);
    await registered.get('developerToolbox.searchDocs')?.();

    expect(showInputBox).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('http://127.0.0.1:8080/docs?q=rebase');
  });

  it('supports the legacy openExternal-function signature', async () => {
    const openExternal = vi.fn().mockResolvedValue(true);
    const result = activate(context(), openExternal);

    await expect(result.searchDocsInToolbox('hooks')).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith('http://127.0.0.1:8080/docs?q=hooks');
  });

  it('deactivates cleanly', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
