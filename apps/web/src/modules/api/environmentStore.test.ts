import { describe, it, expect, beforeEach } from 'vitest';
import { sessionEnv } from './environmentStore';

describe('environmentStore', () => {
  beforeEach(() => {
    sessionEnv.clear();
  });

  it('sets and retrieves session variables in memory', () => {
    sessionEnv.set('baseUrl', 'http://127.0.0.1:8080');
    sessionEnv.set('token', 'secret-123', true);

    expect(sessionEnv.get('baseUrl')?.value).toBe('http://127.0.0.1:8080');
    expect(sessionEnv.get('token')?.isSecret).toBe(true);
    expect(sessionEnv.getAll()).toHaveLength(2);
  });

  it('resolves {{variable}} placeholders in templates', () => {
    sessionEnv.set('host', '127.0.0.1');
    sessionEnv.set('port', '8080');

    const result = sessionEnv.resolve('http://{{host}}:{{port}}/api/v1/pets');
    expect(result.text).toBe('http://127.0.0.1:8080/api/v1/pets');
    expect(result.missingVariables).toEqual([]);
  });

  it('identifies missing variables without replacing with empty strings', () => {
    sessionEnv.set('host', 'localhost');

    const result = sessionEnv.resolve('http://{{host}}:{{port}}/pets/{{petId}}');
    expect(result.text).toBe('http://localhost:{{port}}/pets/{{petId}}');
    expect(result.missingVariables).toEqual(['port', 'petId']);
  });

  it('clears all session variables cleanly', () => {
    sessionEnv.set('a', '1');
    sessionEnv.clear();
    expect(sessionEnv.getAll()).toHaveLength(0);
    expect(sessionEnv.get('a')).toBeUndefined();
  });
});
