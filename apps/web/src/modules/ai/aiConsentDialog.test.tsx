import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { AiConsentDialog } from './AiConsentDialog';

describe('AiConsentDialog', () => {
  it('renders modal when open, displays preview and handles confirm', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <AiConsentDialog
        isOpen={true}
        destination="https://ai.internal.corp"
        category="code_explanation"
        redactedPreview="Hello [REDACTED_SECRET]"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('AI Model Gateway Disclosure')).toBeDefined();
    expect(screen.getByText('https://ai.internal.corp')).toBeDefined();
    expect(screen.getByText('Hello [REDACTED_SECRET]')).toBeDefined();

    fireEvent.click(screen.getByText('Authorize & Transmit'));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <AiConsentDialog
        isOpen={false}
        destination=""
        category=""
        redactedPreview=""
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
