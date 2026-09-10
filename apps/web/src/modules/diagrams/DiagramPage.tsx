import { useState, useEffect } from 'preact/hooks';
import { MermaidEditor } from './MermaidEditor';
import { ExcalidrawEditor } from './ExcalidrawEditor';
import { DiagramStore, type SavedDiagram } from './diagramStore';

export function DiagramPage() {
  const [activeTab, setActiveTab] = useState<'mermaid' | 'excalidraw'>('mermaid');
  const [savedList, setSavedList] = useState<SavedDiagram[]>([]);
  const [currentDiagramId, setCurrentDiagramId] = useState<string | null>(null);
  const [diagramTitle, setDiagramTitle] = useState('My Architecture Diagram');
  const [activeSource, setActiveSource] = useState<string | undefined>();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSavedDiagrams();
  }, []);

  const loadSavedDiagrams = async () => {
    const list = await DiagramStore.list();
    setSavedList(list);
  };

  const handleSaveDiagram = async (sourceData: string) => {
    const id = currentDiagramId || `diag_${Date.now()}`;
    const diagram: SavedDiagram = {
      id,
      kind: activeTab,
      title: diagramTitle.trim() || 'Untitled Diagram',
      source: sourceData,
      updatedAt: new Date().toISOString(),
    };

    await DiagramStore.saveWithIndex(diagram);
    setCurrentDiagramId(id);
    await loadSavedDiagrams();
    setSaveMessage('Diagram saved locally to workspace!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleLoadDiagram = (d: SavedDiagram) => {
    setCurrentDiagramId(d.id);
    setDiagramTitle(d.title);
    setActiveTab(d.kind);
    setActiveSource(d.source);
  };

  const handleDeleteDiagram = async (id: string) => {
    await DiagramStore.deleteWithIndex(id);
    if (currentDiagramId === id) {
      setCurrentDiagramId(null);
      setActiveSource(undefined);
    }
    await loadSavedDiagrams();
  };

  return (
    <div className="container" style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>Diagrams Studio</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Local-first architecture and sequence diagrams (Mermaid) & whiteboarding (Excalidraw).
          </p>
        </div>

        {/* Tab switcher & Title input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            type="text"
            className="input"
            value={diagramTitle}
            onInput={(e) => setDiagramTitle((e.target as HTMLInputElement).value)}
            style={{ width: '220px', fontSize: '0.85rem' }}
          />

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              className={`btn btn-sm ${activeTab === 'mermaid' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('mermaid')}
            >
              Mermaid
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'excalidraw' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('excalidraw')}
            >
              Whiteboard
            </button>
          </div>
        </div>
      </div>

      {saveMessage && (
        <div style={{ fontSize: '0.85rem', color: 'var(--color-success, #10b981)' }}>
          ✓ {saveMessage}
        </div>
      )}

      {/* Main Workspace Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: savedList.length > 0 ? '220px 1fr' : '1fr', gap: '16px' }}>
        {/* Saved diagrams sidebar if any exist */}
        {savedList.length > 0 && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '680px', overflowY: 'auto' }}>
            <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Saved Diagrams</span>
            {savedList.map((d) => (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  backgroundColor: d.id === currentDiagramId ? 'var(--bg-card-hover, rgba(59, 130, 246, 0.1))' : 'transparent',
                  border: d.id === currentDiagramId ? '1px solid var(--color-primary)' : '1px solid transparent',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                <div onClick={() => handleLoadDiagram(d)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  <strong>{d.title}</strong>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{d.kind}</div>
                </div>
                <button
                  onClick={() => handleDeleteDiagram(d.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  title="Delete diagram"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Active Editor */}
        <div style={{ minHeight: '650px' }}>
          {activeTab === 'mermaid' ? (
            <MermaidEditor
              key={currentDiagramId || 'new-mermaid'}
              initialSource={activeSource}
              onSave={handleSaveDiagram}
            />
          ) : (
            <ExcalidrawEditor
              key={currentDiagramId || 'new-excalidraw'}
              initialData={activeSource}
              onSave={handleSaveDiagram}
            />
          )}
        </div>
      </div>
    </div>
  );
}
