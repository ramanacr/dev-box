export type CaseType = 'camel' | 'snake' | 'kebab' | 'pascal' | 'upper' | 'lower';

export const TextTransforms = {
  base64Encode(input: string, urlSafe = false): string {
    const bytes = new TextEncoder().encode(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const b64 = btoa(binary);
    if (urlSafe) {
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    return b64;
  },

  base64Decode(input: string): string {
    let normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  },

  urlEncode(input: string): string {
    return encodeURIComponent(input);
  },

  urlDecode(input: string): string {
    return decodeURIComponent(input);
  },

  htmlEscape(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  htmlUnescape(input: string): string {
    return input
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  },

  sortLines(input: string, direction: 'asc' | 'desc' | 'length'): string {
    const lines = input.split('\n');
    if (direction === 'asc') {
      lines.sort((a, b) => a.localeCompare(b));
    } else if (direction === 'desc') {
      lines.sort((a, b) => b.localeCompare(a));
    } else {
      lines.sort((a, b) => a.length - b.length);
    }
    return lines.join('\n');
  },

  deduplicateLines(input: string): string {
    const lines = input.split('\n');
    const seen = new Set<string>();
    const result: string[] = [];
    for (const l of lines) {
      if (!seen.has(l)) {
        seen.add(l);
        result.push(l);
      }
    }
    return result.join('\n');
  },

  changeCase(input: string, targetCase: CaseType): string {
    // Split into words by spaces, underscores, hyphens, and camelCase boundaries
    const words = input
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) return '';

    switch (targetCase) {
      case 'lower':
        return input.toLowerCase();
      case 'upper':
        return input.toUpperCase();
      case 'camel':
        return words
          .map((w, idx) =>
            idx === 0
              ? w.toLowerCase()
              : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          )
          .join('');
      case 'pascal':
        return words
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join('');
      case 'snake':
        return words.map((w) => w.toLowerCase()).join('_');
      case 'kebab':
        return words.map((w) => w.toLowerCase()).join('-');
      default:
        return input;
    }
  },

  async sha256(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  },

  async sha512(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-512', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  },

  generateUUID(): string {
    return crypto.randomUUID();
  },

  formatTimestamp(epochSecondsOrMs: number): {
    utc: string;
    local: string;
    iso: string;
  } {
    const ms = epochSecondsOrMs < 10000000000 ? epochSecondsOrMs * 1000 : epochSecondsOrMs;
    const date = new Date(ms);
    return {
      utc: date.toUTCString(),
      local: date.toLocaleString(),
      iso: date.toISOString(),
    };
  },
};
