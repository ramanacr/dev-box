import { describe, it, expect, vi } from 'vitest';
import { CollaborationClient } from './collaborationClient';

describe('CollaborationClient', () => {
  it('connects, sends events, and cleans up on disconnect', () => {
    const client = new CollaborationClient();
    expect(client.isConnected()).toBe(false);

    client.connect('ws-alpha', 'usr-1');
    expect(client.isConnected()).toBe(true);

    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);

    const success = client.send('shape_update', { id: 'rect-1', type: 'rectangle' });
    expect(success).toBe(true);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-alpha',
        actorId: 'usr-1',
        kind: 'shape_update',
      })
    );

    unsubscribe();
    client.send('cursor', { x: 10, y: 20 });
    expect(listener).toHaveBeenCalledTimes(1);

    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('rejects payloads larger than 256 KB', () => {
    const client = new CollaborationClient();
    client.connect('ws-beta', 'usr-2');

    const hugePayload = 'X'.repeat(300 * 1024);
    const sent = client.send('shape_update', { data: hugePayload });
    expect(sent).toBe(false);
  });
});
