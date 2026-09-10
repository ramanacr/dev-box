import { evaluateTarget, isHostConfirmed, type RequestPolicy } from './requestPolicy';
import { sessionEnv } from './environmentStore';

export interface RequestInput {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  policy?: RequestPolicy;
}

export type BodyKind = 'json' | 'text' | 'html' | 'xml' | 'binary' | 'empty';

export interface ApiExecution {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  elapsedMs: number;
  bodyText?: string;
  bodyKind: BodyKind;
  bodyBytes?: Uint8Array;
  error?: string;
  requiresHostConfirmation?: { host: string; url: string };
}

const MAX_DISPLAY_BODY_SIZE = 2 * 1024 * 1024; // 2 MB text limit

/**
 * Runs an HTTP request directly from the browser following strict local security policies.
 * Redacts secret headers (authorization, cookie -> '••••') in the returned model.
 */
export async function runRequest(
  input: RequestInput,
  externalSignal?: AbortSignal
): Promise<ApiExecution> {
  // 1. Resolve environment variables in URL, headers, and body
  const urlResolved = sessionEnv.resolve(input.url);
  if (urlResolved.missingVariables.length > 0) {
    return {
      status: 0,
      statusText: 'Variable Resolution Error',
      headers: {},
      elapsedMs: 0,
      bodyKind: 'empty',
      error: `Unresolved environment variables: ${urlResolved.missingVariables.map((v) => '{{' + v + '}}').join(', ')}`,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlResolved.text);
  } catch (err) {
    return {
      status: 0,
      statusText: 'Invalid URL',
      headers: {},
      elapsedMs: 0,
      bodyKind: 'empty',
      error: 'The provided URL is malformed or invalid.',
    };
  }

  // 2. Evaluate target security policy
  const decision = evaluateTarget(parsedUrl, input.policy);
  if (!decision.allowed) {
    return {
      status: 0,
      statusText: 'Target Policy Blocked',
      headers: {},
      elapsedMs: 0,
      bodyKind: 'empty',
      error: decision.reason || 'Target is blocked by request security policy.',
    };
  }

  const hostKey = `${parsedUrl.hostname}:${parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80')}`;
  if (decision.requiresConfirmation && !isHostConfirmed(hostKey)) {
    return {
      status: 0,
      statusText: 'Confirmation Required',
      headers: {},
      elapsedMs: 0,
      bodyKind: 'empty',
      requiresHostConfirmation: {
        host: hostKey,
        url: urlResolved.text,
      },
    };
  }

  // 3. Prepare headers and redact sensitive ones for display
  const requestHeaders = new Headers();
  const displayHeaders: Record<string, string> = {};

  if (input.headers) {
    for (const [key, val] of Object.entries(input.headers)) {
      const resolvedVal = sessionEnv.resolve(val).text;
      requestHeaders.set(key, resolvedVal);

      const lower = key.toLowerCase();
      if (lower === 'authorization' || lower === 'cookie' || lower.includes('token') || lower.includes('secret') || lower.includes('key')) {
        displayHeaders[key] = '••••';
      } else {
        displayHeaders[key] = resolvedVal;
      }
    }
  }

  // 4. Execute fetch with 30s timeout
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 30000);

  const combinedSignal = externalSignal
    ? anySignal([externalSignal, abortController.signal])
    : abortController.signal;

  const startTime = performance.now();

  try {
    const isBodyAllowed = !['GET', 'HEAD'].includes(input.method.toUpperCase());
    const bodyResolved = isBodyAllowed && input.body ? sessionEnv.resolve(input.body).text : undefined;

    const res = await fetch(parsedUrl.toString(), {
      method: input.method.toUpperCase(),
      headers: requestHeaders,
      body: bodyResolved,
      signal: combinedSignal,
    });

    const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10;
    clearTimeout(timeoutId);

    // Extract response headers
    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    // Content type inspection
    const contentType = (responseHeaders['content-type'] || '').toLowerCase();
    const isJson = contentType.includes('application/json');
    const isHtml = contentType.includes('text/html');
    const isXml = contentType.includes('xml');
    const isText = contentType.startsWith('text/') || isJson || isHtml || isXml;

    if (!isText && !isJson) {
      // Binary content - do not pass through text parser
      const arrayBuf = await res.arrayBuffer();
      const bodyBytes = new Uint8Array(arrayBuf);
      return {
        status: res.status,
        statusText: res.statusText,
        headers: responseHeaders,
        elapsedMs,
        bodyKind: 'binary',
        bodyBytes,
        bodyText: `[Binary response: ${bodyBytes.byteLength} bytes - downloadable]`,
      };
    }

    const text = await res.text();
    let bodyKind: BodyKind = 'text';
    if (isJson) bodyKind = 'json';
    else if (isHtml) bodyKind = 'html';
    else if (isXml) bodyKind = 'xml';

    // Cap displayed text at 2 MB
    let bodyText = text;
    if (text.length > MAX_DISPLAY_BODY_SIZE) {
      bodyText = text.slice(0, MAX_DISPLAY_BODY_SIZE) + '\n\n[Truncated: Response exceeds 2 MB display limit]';
    }

    return {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
      elapsedMs,
      bodyText,
      bodyKind,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10;
    const isAbort = (err as Error)?.name === 'AbortError';

    return {
      status: 0,
      statusText: isAbort ? 'Request Timeout (30s)' : 'Network Error',
      headers: {},
      elapsedMs,
      bodyKind: 'empty',
      error: isAbort
        ? 'The request exceeded the 30-second execution timeout and was aborted.'
        : 'Network error or CORS policy prevented the browser from completing the request directly.',
    };
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort();
      return sig;
    }
    sig.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
