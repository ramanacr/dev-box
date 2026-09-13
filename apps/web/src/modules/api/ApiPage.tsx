import { useState, useEffect } from 'preact/hooks';
import { parseOpenApi, type ParsedApi, type ApiOperation } from './openapi';
import { sessionEnv, type EnvironmentVariable } from './environmentStore';
import { runRequest, type ApiExecution } from './requestRunner';
import { validateResponse, type ValidationResult } from './responseValidation';
import { HostConfirmationDialog } from './HostConfirmationDialog';
import { OperationList } from './OperationList';
import { RequestEditor } from './RequestEditor';
import { ResponseView } from './ResponseView';
import { CodeExamples } from './CodeExamples';
import { confirmHost } from './requestPolicy';
import { WorkspaceStore } from '@/platform/storage/workspaceStore';


export function ApiPage() {
  const [specInput, setSpecInput] = useState<string>('');
  const [parsedApi, setParsedApi] = useState<ParsedApi | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedOp, setSelectedOp] = useState<ApiOperation | null>(null);
  const [filterText, setFilterText] = useState<string>('');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);

  // Execution & Validation results
  const [lastExecution, setLastExecution] = useState<ApiExecution | undefined>();
  const [lastValidation, setLastValidation] = useState<ValidationResult | undefined>();

  // Confirmation Modal state
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    host: string;
    url: string;
    config: { url: string; method: string; headers: Record<string, string>; body?: string };
  } | null>(null);

  // Environment variables modal
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);
  const [newVarName, setNewVarName] = useState('');
  const [newVarValue, setNewVarValue] = useState('');
  const [newVarIsSecret, setNewVarIsSecret] = useState(false);

  // Saved spec name for IndexedDB
  const [specName, setSpecName] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    setEnvVars(sessionEnv.getAll());
  }, []);

  const handleParseSpec = async (raw: string) => {
    setSpecInput(raw);
    if (!raw.trim()) {
      setParsedApi(null);
      setSelectedOp(null);
      setParseError(null);
      return;
    }

    const result = await parseOpenApi(raw);
    if (result.error) {
      setParseError(result.error.message);
      setParsedApi(null);
      setSelectedOp(null);
    } else if (result.api) {
      setParseError(null);
      setParsedApi(result.api);
      setSelectedServer(result.api.servers[0]?.url || 'http://localhost:8080');
      if (result.api.operations.length > 0) {
        setSelectedOp(result.api.operations[0] || null);
      }
    }
  };


  const handleFileUpload = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      handleParseSpec(content);
      if (!specName) setSpecName(file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsText(file);
  };

  const executeRequest = async (config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }) => {
    setIsExecuting(true);
    setLastExecution(undefined);
    setLastValidation(undefined);

    const execResult = await runRequest(config);
    setIsExecuting(false);

    if (execResult.requiresHostConfirmation) {
      setPendingConfirmation({
        host: execResult.requiresHostConfirmation.host,
        url: execResult.requiresHostConfirmation.url,
        config,
      });
      return;
    }

    setLastExecution(execResult);

    // Validate response schema against operation definition if status is matching
    if (selectedOp && execResult.bodyText && execResult.bodyKind === 'json') {
      const respDef = selectedOp.responses.find(
        (r) => r.statusCode === String(execResult.status) || r.statusCode === 'default'
      );
      if (respDef?.schema) {
        try {
          const parsedBody = JSON.parse(execResult.bodyText);
          const validation = validateResponse(respDef.schema, parsedBody);
          setLastValidation(validation);
        } catch {
          // Body not valid JSON
        }
      }
    }
  };

  const handleConfirmHost = async () => {
    if (!pendingConfirmation) return;
    confirmHost(pendingConfirmation.host);
    const cfg = pendingConfirmation.config;
    setPendingConfirmation(null);
    await executeRequest(cfg);
  };

  const handleSaveSpecToWorkspace = async () => {
    if (!specName.trim() || !specInput.trim()) return;
    try {
      await WorkspaceStore.set(`openapi_spec_${specName.trim()}`, {
        name: specName.trim(),
        content: specInput,
        updatedAt: new Date().toISOString(),
      });
      setSaveStatus('Specification saved to local workspace!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus('Failed to save to workspace.');
    }
  };


  const handleAddEnvVar = () => {
    if (!newVarName.trim()) return;
    sessionEnv.set(newVarName.trim(), newVarValue, newVarIsSecret);
    setEnvVars(sessionEnv.getAll());
    setNewVarName('');
    setNewVarValue('');
    setNewVarIsSecret(false);
  };

  const handleDeleteEnvVar = (name: string) => {
    sessionEnv.delete(name);
    setEnvVars(sessionEnv.getAll());
  };

  return (
    <div className="container" style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>API Workbench</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Local-first OpenAPI inspector, environment manager, and guarded request composer.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={() => setShowEnvModal(true)}>
            ⚙️ Environments ({envVars.length})
          </button>
        </div>
      </div>

      {/* Spec Importer / Loader */}
      {!parsedApi && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ margin: 0 }}>Import OpenAPI Specification</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Upload an OpenAPI 3.0/3.1 or Swagger 2.0 file (YAML or JSON). Processing runs entirely in your browser.
          </p>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              Select YAML / JSON File
              <input type="file" accept=".yaml,.yml,.json" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>or paste raw specification below</span>
          </div>

          <textarea
            className="input"
            rows={10}
            placeholder="openapi: 3.1.0
info:
  title: My Local API..."
            value={specInput}
            onInput={(e) => handleParseSpec((e.target as HTMLTextAreaElement).value)}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
          />

          {parseError && (
            <div style={{ color: 'var(--color-error)', fontSize: '0.9rem' }}>
              ❌ {parseError}
            </div>
          )}
        </div>
      )}

      {/* Loaded Spec Workbench Interface */}
      {parsedApi && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top Bar with API title, server dropdown, and reload */}
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{parsedApi.title}</span>
              <span className="badge">v{parsedApi.version}</span>
              <select
                className="input"
                value={selectedServer}
                onChange={(e) => setSelectedServer((e.target as HTMLSelectElement).value)}
                style={{ fontSize: '0.85rem', padding: '4px 8px' }}
              >
                {parsedApi.servers.map((s) => (
                  <option key={s.url} value={s.url}>
                    {s.url} {s.description ? `(${s.description})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                className="input"
                placeholder="Spec name to save..."
                value={specName}
                onInput={(e) => setSpecName((e.target as HTMLInputElement).value)}
                style={{ fontSize: '0.85rem', width: '150px' }}
              />
              <button className="btn btn-secondary btn-sm" onClick={handleSaveSpecToWorkspace}>
                Save Spec
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setParsedApi(null);
                  setSpecInput('');
                  setSelectedOp(null);
                }}
              >
                Change Spec
              </button>
            </div>
          </div>

          {saveStatus && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-success)' }}>
              ✓ {saveStatus}
            </div>
          )}

          {/* Main 2-column layout: Left (Operations) & Right (Editor + Response) */}
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '16px', minHeight: '600px' }}>
            {/* Left Column: Operation List */}
            <div className="card" style={{ height: '700px', overflow: 'hidden' }}>
              <OperationList
                operations={parsedApi.operations}
                selectedId={selectedOp?.id}
                onSelect={(op) => setSelectedOp(op)}
                filterText={filterText}
                onFilterChange={setFilterText}
              />
            </div>

            {/* Right Column: Request Editor, Response, and Code Snippets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedOp ? (
                <>
                  <RequestEditor
                    operation={selectedOp}
                    serverUrl={selectedServer}
                    onSend={executeRequest}
                    isExecuting={isExecuting}
                  />

                  <ResponseView
                    execution={lastExecution}
                    validation={lastValidation}
                  />

                  <CodeExamples
                    operation={selectedOp}
                    resolvedUrl={selectedServer + selectedOp.path}
                    method={selectedOp.method}
                    headers={{ Accept: 'application/json' }}
                  />
                </>
              ) : (
                <div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Select an endpoint from the left to inspect and execute requests.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* First-Host Confirmation Modal */}
      {pendingConfirmation && (
        <HostConfirmationDialog
          targetHost={pendingConfirmation.host}
          targetUrl={pendingConfirmation.url}
          onConfirm={handleConfirmHost}
          onCancel={() => setPendingConfirmation(null)}
        />
      )}

      {/* Session Environments Modal */}
      {showEnvModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '600px', width: '90%' }}>
            <h3 style={{ marginTop: 0 }}>Session Environments</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Variables set here are stored <strong>strictly in browser memory</strong> for this session and are cleared upon page refresh.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto', marginBottom: '16px' }}>
              {envVars.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No variables set yet.</div>
              ) : (
                envVars.map((v) => (
                  <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <code style={{ width: '140px', fontWeight: 'bold' }}>{'{'}{'{'}{v.name}{'}'}{'}'}</code>
                    <input
                      type={v.isSecret ? 'password' : 'text'}
                      className="input"
                      value={v.value}
                      readOnly
                      style={{ flex: 1, fontSize: '0.85rem' }}
                    />
                    <button className="btn btn-sm btn-secondary" onClick={() => handleDeleteEnvVar(v.name)}>
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add new variable form */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <input
                type="text"
                className="input"
                placeholder="Variable name"
                value={newVarName}
                onInput={(e) => setNewVarName((e.target as HTMLInputElement).value)}
                style={{ width: '130px', fontSize: '0.85rem' }}
              />
              <input
                type="text"
                className="input"
                placeholder="Value"
                value={newVarValue}
                onInput={(e) => setNewVarValue((e.target as HTMLInputElement).value)}
                style={{ flex: 1, fontSize: '0.85rem' }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newVarIsSecret}
                  onChange={(e) => setNewVarIsSecret((e.target as HTMLInputElement).checked)}
                />
                Secret
              </label>
              <button className="btn btn-primary btn-sm" onClick={handleAddEnvVar}>
                Add
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="btn btn-secondary" onClick={() => setShowEnvModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
