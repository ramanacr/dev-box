import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { DataPage } from './DataPage';

/**
 * Component coverage for the structured-data workbench.
 *
 * Required by the Phase 1 plan (Task 6, Step 4) and never written. The plan also says
 * to mock the worker protocol rather than run parsing on the UI test thread, which is
 * what the Worker stub below does.
 */

/** Records posted messages and lets a test reply as the worker would. */
class StubWorker implements Partial<Worker> {
  static instances: StubWorker[] = [];

  posted: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor() {
    StubWorker.instances.push(this);
  }

  postMessage(message: unknown): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'message') this.onmessage = listener as (event: MessageEvent) => void;
    if (type === 'error') this.onerror = listener as (event: ErrorEvent) => void;
  }

  removeEventListener(): void {
    /* no-op */
  }

  /** Delivers a worker reply to the page. */
  reply(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('DataPage', () => {
  beforeEach(() => {
    StubWorker.instances = [];
    vi.stubGlobal('Worker', StubWorker as unknown as typeof Worker);
  });

  it('renders the workbench heading and an editor', () => {
    render(<DataPage />);

    expect(screen.getByRole('heading', { name: /Structured Data Workbench/i })).toBeDefined();
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
  });

  it('offers every documented source format', () => {
    render(<DataPage />);

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const options = selects.flatMap((select) =>
      Array.from(select.options).map((option) => option.value.toLowerCase()),
    );

    for (const format of ['json', 'yaml', 'xml', 'csv']) {
      expect(options).toContain(format);
    }
  });

  it('shows a byte count for the current input', async () => {
    render(<DataPage />);

    const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: '{"a":1}' } });

    await waitFor(() => {
      // The plan requires the byte count to be shown prominently.
      expect(screen.getByText(/bytes/i)).toBeDefined();
    });
  });

  it('reports invalid JSON to the user', async () => {
    render(<DataPage />);

    const editor = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
    fireEvent.input(editor, { target: { value: '{ not valid json' } });

    const formatButton = screen.getAllByRole('button').find((b) => /format/i.test(b.textContent ?? ''));
    if (formatButton) fireEvent.click(formatButton);

    await waitFor(
      () => {
        // Either the page validates inline or the worker reports back; both surface
        // a message rather than failing silently.
        const text = document.body.textContent ?? '';
        expect(/invalid|error|unexpected|failed/i.test(text)).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  it('does not leave a worker running after unmount', () => {
    const { unmount } = render(<DataPage />);
    unmount();

    // Any worker the page created must be terminated, or a long session leaks one
    // per visit to the route.
    for (const instance of StubWorker.instances) {
      expect(instance.terminated).toBe(true);
    }
  });
});
