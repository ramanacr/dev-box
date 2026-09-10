import { useState } from 'preact/hooks';

export interface HostConfirmationDialogProps {
  targetHost: string;
  targetUrl: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function HostConfirmationDialog({
  targetHost,
  targetUrl,
  onConfirm,
  onCancel,
}: HostConfirmationDialogProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="modal-card">
        <h3 id="confirm-dialog-title" style={{ marginTop: 0, color: 'var(--color-primary)' }}>
          Confirm Network Destination
        </h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          This is the first request to destination host <strong>{targetHost}</strong>.
          Developer Toolbox operates locally and will send an HTTP network request directly from your browser to:
        </p>
        <div style={{
          backgroundColor: 'var(--bg-card-subtle)',
          padding: '10px 12px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          wordBreak: 'break-all',
          marginBottom: '16px',
          border: '1px solid var(--border-color)',
        }}>
          {targetUrl}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Allow & Send Request
          </button>
        </div>
      </div>
    </div>
  );
}
