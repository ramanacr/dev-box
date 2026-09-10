import { useState, useEffect, useCallback } from 'preact/hooks';
import { DocsSearchBox } from './DocsSearchBox';
import { DocsResults } from './DocsResults';
import { DocumentView } from './DocumentView';
import { DocsUploadModal } from './DocsUploadModal';
import { ToolboxClient, type DocsSearchResult, type DocsDocument } from '@/platform/http/toolboxClient';
import { WorkspaceStore } from '@/platform/storage/workspaceStore';

export function DocsPage() {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('');
  const [results, setResults] = useState<DocsSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedDoc, setSelectedDoc] = useState<DocsDocument | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [searchError, setSearchError] = useState<string | undefined>();
  const [docError, setDocError] = useState<string | undefined>();
  const [hasSearched, setHasSearched] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Load document by ID (from permalink or selection)
  const loadDocument = useCallback(async (id: string) => {
    setIsLoadingDoc(true);
    setDocError(undefined);
    try {
      const doc = await ToolboxClient.getDocument(id);
      setSelectedDoc(doc);
      // update URL search params without full reload
      const url = new URL(window.location.href);
      url.searchParams.set('id', id);
      window.history.pushState({}, '', url.toString());
    } catch (err: unknown) {
      setDocError(err instanceof Error ? err.message : 'Failed to load document');
      setSelectedDoc(null);
    } finally {
      setIsLoadingDoc(false);
    }
  }, []);

  // Execute search
  const performSearch = useCallback(async (q: string, s: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoadingResults(true);
    setSearchError(undefined);
    setHasSearched(true);
    setSelectedIndex(-1);

    try {
      const res = await ToolboxClient.searchDocs({ text: q, source: s || undefined });
      setResults(res);
      // Persist recent query
      await WorkspaceStore.set('docs/recent-query', { query: q, source: s });
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Documentation search failed');
      setResults([]);
    } finally {
      setIsLoadingResults(false);
    }
  }, []);

  // Check URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const docId = params.get('id');
    if (docId) {
      loadDocument(docId);
      return;
    }

    // Otherwise restore recent query from IndexedDB
    WorkspaceStore.get<{ query: string; source: string }>('docs/recent-query').then((saved) => {
      if (saved && saved.query) {
        setQuery(saved.query);
        setSource(saved.source || '');
        performSearch(saved.query, saved.source || '');
      }
    });
  }, [loadDocument, performSearch]);

  const handleQueryChange = (newQ: string) => {
    setQuery(newQ);
    performSearch(newQ, source);
  };

  const handleSourceChange = (newS: string) => {
    setSource(newS);
    if (query.trim()) {
      performSearch(query, newS);
    }
  };

  const handleKeyDownNav = (e: KeyboardEvent) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    }
  };

  const handleBackToSearch = () => {
    setSelectedDoc(null);
    setDocError(undefined);
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.pushState({}, '', url.toString());
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Documentation Search</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Offline search backed by SQLite FTS5 with BM25 relevance ranking.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setIsModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <span>📁</span>
          <span>Manage / Upload Docs</span>
        </button>
      </div>

      <DocsUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onDocumentAdded={(id) => {
          loadDocument(id);
          setIsModalOpen(false);
        }}
        onDocumentDeleted={() => {
          if (query.trim()) {
            performSearch(query, source);
          }
        }}
      />

      {selectedDoc || isLoadingDoc || docError ? (
        <DocumentView
          document={selectedDoc}
          isLoading={isLoadingDoc}
          errorMessage={docError}
          onBack={handleBackToSearch}
        />
      ) : (
        <>
          <DocsSearchBox
            value={query}
            source={source}
            onChange={handleQueryChange}
            onSourceChange={handleSourceChange}
            onSubmit={(immediateQ) => performSearch(immediateQ ?? query, source)}
            onClear={() => {
              setQuery('');
              setResults([]);
              setHasSearched(false);
            }}
            onKeyDownNav={handleKeyDownNav}
            isLoading={isLoadingResults}
          />

          <DocsResults
            results={results}
            selectedIndex={selectedIndex}
            onSelect={(id) => loadDocument(id)}
            isLoading={isLoadingResults}
            hasSearched={hasSearched}
            errorMessage={searchError}
          />
        </>
      )}
    </div>
  );
}
