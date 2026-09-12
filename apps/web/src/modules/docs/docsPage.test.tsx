import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { DocsPage } from './DocsPage';
import { ToolboxClient, ToolboxApiError } from '@/platform/http/toolboxClient';

/**
 * Component coverage for the documentation browser.
 *
 * The Phase 1 plan requires this file (Task 5) and says to mock the API client rather
 * than the network. It was never written, so debounce behaviour, error announcement
 * and result rendering had no regression protection.
 */

const RESULTS = [
  {
    id: 'aspnetcore/dependency-injection',
    title: 'Dependency injection in ASP.NET Core',
    url: 'https://learn.microsoft.com/aspnet/core/fundamentals/dependency-injection',
    snippet: 'ASP.NET Core supports the <mark>dependency</mark> <mark>injection</mark> pattern…',
    source: 'aspnetcore',
    score: -3.24,
  },
];

describe('DocsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // The upload modal and custom-doc list also call the client; default them to empty
    // so a test only has to set up what it cares about.
    vi.spyOn(ToolboxClient, 'listCustomDocuments').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the search heading and an accessible input', () => {
    vi.spyOn(ToolboxClient, 'searchDocs').mockResolvedValue([]);

    render(<DocsPage />);

    expect(screen.getByRole('heading', { name: /Documentation Search/i })).toBeDefined();
    expect(screen.getByRole('searchbox')).toBeDefined();
  });

  it('debounces typing rather than querying on every keystroke', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const searchDocs = vi.spyOn(ToolboxClient, 'searchDocs').mockResolvedValue(RESULTS);

    render(<DocsPage />);
    const input = screen.getByRole('searchbox');

    fireEvent.input(input, { target: { value: 'dep' } });
    fireEvent.input(input, { target: { value: 'depen' } });
    fireEvent.input(input, { target: { value: 'dependency' } });

    expect(searchDocs).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => {
      expect(searchDocs).toHaveBeenCalled();
    });
    // Only the settled value is queried, not each intermediate keystroke.
    expect(searchDocs).toHaveBeenCalledTimes(1);
    expect(searchDocs).toHaveBeenCalledWith(expect.objectContaining({ text: 'dependency' }));
  });

  it('renders a result with its title and source', async () => {
    vi.spyOn(ToolboxClient, 'searchDocs').mockResolvedValue(RESULTS);

    render(<DocsPage />);
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'dependency injection' } });

    await waitFor(
      () => {
        expect(screen.getByText(/Dependency injection in ASP.NET Core/i)).toBeDefined();
      },
      { timeout: 3000 },
    );
    expect(screen.getByText(/aspnetcore/i)).toBeDefined();
  });

  it('announces a search failure through an alert role', async () => {
    vi.spyOn(ToolboxClient, 'searchDocs').mockRejectedValue(
      new ToolboxApiError('documentation search requires the local container', 503),
    );

    render(<DocsPage />);
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'anything' } });

    await waitFor(
      () => {
        expect(screen.getByRole('alert')).toBeDefined();
      },
      { timeout: 3000 },
    );
  });

  it('does not render an error before any search has run', () => {
    vi.spyOn(ToolboxClient, 'searchDocs').mockResolvedValue([]);
    render(<DocsPage />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports an empty result set without an error', async () => {
    vi.spyOn(ToolboxClient, 'searchDocs').mockResolvedValue([]);

    render(<DocsPage />);
    fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzzznomatch' } });

    await waitFor(
      () => {
        expect(screen.getByText(/No documentation found/i)).toBeDefined();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
