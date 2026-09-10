import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { MermaidEditor } from './MermaidEditor';

describe('MermaidEditor Safety and Strict Mode', () => {
  it('renders without error for valid initial diagram', () => {
    render(<MermaidEditor />);
    expect(screen.getByText(/Mermaid Definition/i)).toBeDefined();
    expect(screen.getByText(/Export SVG/i)).toBeDefined();
  });

  it('rejects forbidden navigation actions (click ... href)', async () => {
    const malicious = `flowchart TD
      A[Click me]
      click A href "http://evil.com" "Malicious Link"
    `;

    render(<MermaidEditor initialSource={malicious} />);

    await waitFor(() => {
      expect(
        screen.getByText(/External navigation actions \("click ... href\/call"\) are forbidden/i)
      ).toBeDefined();
    });
  });
});
