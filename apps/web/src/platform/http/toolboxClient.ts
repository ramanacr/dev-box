export interface DocsSearchQuery {
  text: string;
  source?: string;
  limit?: number;
}

export interface DocsSearchResult {
  id: string;
  title: string;
  url: string;
  snippet: string;
  source: string;
  score: number;
}

export interface DocsDocument {
  id: string;
  source: string;
  title: string;
  url: string;
  bodyHtml: string;
  attribution: string;
}

export interface UserDocumentSummary {
  id: string;
  title: string;
  filename: string;
  byteSize: number;
  createdAt: string;
}

export class ToolboxApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText?: string
  ) {
    super(message);
    this.name = 'ToolboxApiError';
  }
}

const TIMEOUT_MS = 5000;

export const ToolboxClient = {
  async searchDocs(query: DocsSearchQuery): Promise<DocsSearchResult[]> {
    const params = new URLSearchParams();
    params.set('q', query.text);
    if (query.source) params.set('source', query.source);
    if (query.limit) params.set('limit', query.limit.toString());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`/api/docs/search?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        let msg = 'Failed to search documentation';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // keep default safe message
        }
        throw new ToolboxApiError(msg, res.status, res.statusText);
      }

      return (await res.json()) as DocsSearchResult[];
    } catch (err: unknown) {
      if (err instanceof ToolboxApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ToolboxApiError('Documentation search timed out', 408, 'Timeout');
      }
      throw new ToolboxApiError('Network request failed or local server is unreachable', 0);
    } finally {
      clearTimeout(timer);
    }
  },

  async getDocument(id: string): Promise<DocsDocument> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`/api/docs/${encodeURIComponent(id)}`, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        let msg = 'Document not found';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // fallback
        }
        throw new ToolboxApiError(msg, res.status, res.statusText);
      }

      return (await res.json()) as DocsDocument;
    } catch (err: unknown) {
      if (err instanceof ToolboxApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ToolboxApiError('Request timed out', 408, 'Timeout');
      }
      throw new ToolboxApiError('Network request failed or local server is unreachable', 0);
    } finally {
      clearTimeout(timer);
    }
  },

  async listCustomDocuments(): Promise<UserDocumentSummary[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch('/api/docs/custom', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new ToolboxApiError('Failed to list custom documents', res.status, res.statusText);
      }

      return (await res.json()) as UserDocumentSummary[];
    } catch (err: unknown) {
      if (err instanceof ToolboxApiError) throw err;
      throw new ToolboxApiError('Failed to retrieve custom documents', 0);
    } finally {
      clearTimeout(timer);
    }
  },

  async uploadDocument(file: File, title?: string): Promise<DocsDocument> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000); // 15s for file upload

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (title && title.trim()) {
        formData.append('title', title.trim());
      }

      const res = await fetch('/api/docs/upload', {
        method: 'POST',
        signal: controller.signal,
        body: formData,
      });

      if (!res.ok) {
        let msg = 'Failed to upload document';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // fallback
        }
        throw new ToolboxApiError(msg, res.status, res.statusText);
      }

      return (await res.json()) as DocsDocument;
    } catch (err: unknown) {
      if (err instanceof ToolboxApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ToolboxApiError('Document upload timed out', 408, 'Timeout');
      }
      throw new ToolboxApiError('Upload failed: server unreachable', 0);
    } finally {
      clearTimeout(timer);
    }
  },

  async deleteCustomDocument(id: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`/api/docs/custom/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        signal: controller.signal,
      });

      if (!res.ok) {
        let msg = 'Failed to delete document';
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          // fallback
        }
        throw new ToolboxApiError(msg, res.status, res.statusText);
      }
    } catch (err: unknown) {
      if (err instanceof ToolboxApiError) throw err;
      throw new ToolboxApiError('Delete failed: server unreachable', 0);
    } finally {
      clearTimeout(timer);
    }
  },
};
