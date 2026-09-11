import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/preact';
import { WorkspacePage } from './WorkspacePage';

describe('WorkspacePage UI Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders disabled state in localhost mode when team mode is off', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ enabled: false }),
    } as any);

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(screen.getByText(/Localhost Anonymous Mode/i)).toBeDefined();
    });
  });

  it('renders workspace list when team mode is enabled and authenticated', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: true, authenticated: true, user: { name: 'Alice' } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'ws-1', name: 'Engineering Core', ownerSubject: 'usr_1', createdAt: '2026-09-11' }
        ],
      } as any);

    render(<WorkspacePage />);

    await waitFor(() => {
      expect(screen.getByText('Shared Workspaces')).toBeDefined();
      expect(screen.getByText('Engineering Core')).toBeDefined();
    });
  });
});
