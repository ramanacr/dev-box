interface AiConsentDialogProps {
  isOpen: boolean;
  destination: string;
  category: string;
  redactedPreview: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AiConsentDialog({
  isOpen,
  destination,
  category,
  redactedPreview,
  onConfirm,
  onCancel,
}: AiConsentDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        className="card"
        style={{
          width: '90%',
          maxWidth: '520px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>AI Model Gateway Disclosure</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Your prompt will be processed through an organization-approved gateway. Automatic execution of AI outputs is prohibited.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', marginBottom: '12px' }}>
          <div><strong>Destination:</strong> <code>{destination}</code></div>
          <div><strong>Classification Category:</strong> <span>{category}</span></div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Redacted Prompt Preview:</span>
          <pre
            style={{
              maxHeight: '120px',
              overflowY: 'auto',
              backgroundColor: 'var(--code-bg)',
              padding: '8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              marginTop: '4px',
            }}
          >
            {redactedPreview}
          </pre>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Authorize & Transmit</button>
        </div>
      </div>
    </div>
  );
}
