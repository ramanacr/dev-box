import { useState, useEffect, useRef } from 'preact/hooks';
import { ToolboxClient, type UserDocumentSummary } from '@/platform/http/toolboxClient';

interface DocsUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentAdded: (id: string) => void;
  onDocumentDeleted: () => void;
}

export function DocsUploadModal({
  isOpen,
  onClose,
  onDocumentAdded,
  onDocumentDeleted,
}: DocsUploadModalProps) {
  const [documents, setDocuments] = useState<UserDocumentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await ToolboxClient.listCustomDocuments();
      setDocuments(list);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
      setSelectedFile(null);
      setTitleInput('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!titleInput) {
        setTitleInput(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleFileSelect = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      setSelectedFile(file);
      if (!titleInput) {
        setTitleInput(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async (e: Event) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage('Please select a Markdown (.md), HTML (.html), or text (.txt) file to upload');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const doc = await ToolboxClient.uploadDocument(selectedFile, titleInput);
      setSelectedFile(null);
      setTitleInput('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadDocuments();
      onDocumentAdded(doc.id);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm('Are you sure you want to delete ' + name + '?')) {
      return;
    }

    try {
      await ToolboxClient.deleteCustomDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      onDocumentDeleted();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          padding: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '0.75rem',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Custom Documentation & Uploads</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Ingest offline Markdown, HTML, or text files into your local searchable database.
            </p>
          </div>
          <button className="btn" type="button" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            style={{
              padding: '0.75rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid var(--danger-color)',
              borderRadius: 'var(--radius-md)',
              color: '#fca5a5',
              marginBottom: '1rem',
              fontSize: '0.85rem',
            }}
          >
            {errorMessage}
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '0.25rem' }}>
          {/* Upload Form */}
          <form onSubmit={handleUpload} style={{ marginBottom: '1.5rem' }}>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed ' + (dragOver ? 'var(--primary-color)' : 'var(--border-color)'),
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: dragOver ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-tertiary)',
                transition: 'all 0.15s ease-in-out',
                marginBottom: '1rem',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.html,.htm,.txt"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>📁</div>
              {selectedFile ? (
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{selectedFile.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>
                    ({formatSize(selectedFile.size)})
                  </span>
                </div>
              ) : (
                <div>
                  <span style={{ fontWeight: 500 }}>Click to browse</span> or drag and drop files here
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Supports Markdown (.md), HTML (.html), and plain text (.txt) up to 10 MB
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <input
                type="text"
                className="input"
                placeholder="Document title (optional, inferred from file if empty)"
                value={titleInput}
                onInput={(e) => setTitleInput((e.target as HTMLInputElement).value)}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="btn"
                disabled={!selectedFile || isUploading}
                style={{
                  minWidth: '120px',
                  backgroundColor: 'var(--primary-color)',
                  color: '#fff',
                  border: 'none',
                }}
              >
                {isUploading ? 'Ingesting…' : 'Upload & Index'}
              </button>
            </div>
          </form>

          {/* Current Documents List */}
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span>Uploaded Documents</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-secondary)' }}>
              {documents.length} item{documents.length !== 1 ? 's' : ''}
            </span>
          </h3>

          {isLoading ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Loading documents…
            </div>
          ) : documents.length === 0 ? (
            <div
              style={{
                padding: '1.5rem',
                textAlign: 'center',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
              }}
            >
              No user documents uploaded yet. Upload a Markdown runbook or architecture document above to search it offline!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ overflow: 'hidden', marginRight: '0.75rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {doc.title}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {doc.filename} • {formatSize(doc.byteSize)} • {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{ color: 'var(--danger-color)', padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                    onClick={() => handleDelete(doc.id, doc.title)}
                    title="Delete document"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
