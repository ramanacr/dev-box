export interface EnvironmentVariable {
  name: string;
  value: string;
  isSecret?: boolean;
}

export interface ResolveResult {
  text: string;
  missingVariables: string[];
}

/**
 * Pure session-memory store for API workbench environment variables.
 * Never persists variables to IndexedDB, LocalStorage, or logs.
 * Cleared automatically upon page refresh.
 */
class SessionEnvironmentStore {
  private variables = new Map<string, EnvironmentVariable>();

  public set(name: string, value: string, isSecret = false): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.variables.set(trimmed, { name: trimmed, value, isSecret });
  }

  public get(name: string): EnvironmentVariable | undefined {
    return this.variables.get(name.trim());
  }

  public delete(name: string): void {
    this.variables.delete(name.trim());
  }

  public clear(): void {
    this.variables.clear();
  }

  public getAll(): EnvironmentVariable[] {
    return Array.from(this.variables.values());
  }

  /**
   * Resolves {{variable}} placeholders in a string using current session variables.
   * If a variable is missing, it is not replaced with an empty string; instead,
   * it remains as {{variable}} and is recorded in missingVariables.
   */
  public resolve(template: string): ResolveResult {
    if (!template) {
      return { text: '', missingVariables: [] };
    }

    const missing = new Set<string>();
    const resolved = template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, varName) => {
      const entry = this.variables.get(varName);
      if (entry !== undefined && entry.value !== undefined) {
        return entry.value;
      }
      missing.add(varName);
      return match;
    });

    return {
      text: resolved,
      missingVariables: Array.from(missing),
    };
  }
}

export const sessionEnv = new SessionEnvironmentStore();
