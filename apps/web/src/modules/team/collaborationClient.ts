/**
 * Asynchronous / real-time collaboration client for shared Excalidraw whiteboards
 */

export interface CollabEvent {
  workspaceId: string;
  actorId: string;
  kind: 'shape_update' | 'cursor' | 'sync';
  payload: any;
}

export type CollabListener = (event: CollabEvent) => void;

export class CollaborationClient {
  private listeners = new Set<CollabListener>();
  private activeWorkspaceId: string | null = null;
  private currentActorId: string = 'local_actor';

  connect(workspaceId: string, actorId: string): void {
    this.activeWorkspaceId = workspaceId;
    this.currentActorId = actorId;
  }

  disconnect(): void {
    this.activeWorkspaceId = null;
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.activeWorkspaceId !== null;
  }

  send(kind: 'shape_update' | 'cursor' | 'sync', payload: any): boolean {
    if (!this.activeWorkspaceId) return false;

    // Frame size guard (256 KB)
    const serialized = JSON.stringify(payload);
    if (new TextEncoder().encode(serialized).length > 256 * 1024) {
      console.warn('Collab message exceeds 256 KB frame limit');
      return false;
    }

    const event: CollabEvent = {
      workspaceId: this.activeWorkspaceId,
      actorId: this.currentActorId,
      kind,
      payload,
    };

    // Notify listeners locally
    this.listeners.forEach((l) => l(event));
    return true;
  }

  subscribe(listener: CollabListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
