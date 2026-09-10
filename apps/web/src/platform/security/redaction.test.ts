import { describe, it, expect } from 'vitest';
import { redactSensitiveText } from './redaction';

describe('Secret Redaction Engine', () => {
  it('redacts Authorization Bearer tokens while preserving header label', () => {
    const text = 'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.xyz" https://api.internal/data';
    const result = redactSensitiveText(text);

    expect(result.hasSecrets).toBe(true);
    expect(result.detectedTypes).toContain('Authorization: Bearer');
    expect(result.redactedText).toContain('Authorization: Bearer [REDACTED:BEARER_TOKEN]');
    expect(result.redactedText).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result.redactedText).toContain('https://api.internal/data');
  });

  it('redacts GitHub Personal Access Tokens (ghp_)', () => {
    const text = 'GIT_TOKEN=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const result = redactSensitiveText(text);

    expect(result.hasSecrets).toBe(true);
    expect(result.detectedTypes).toContain('GitHub Token');
    expect(result.redactedText).toBe('GIT_TOKEN=[REDACTED:GITHUB_TOKEN]');
  });

  it('redacts AI provider keys (sk-)', () => {
    const text = 'OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012';
    const result = redactSensitiveText(text);

    expect(result.hasSecrets).toBe(true);
    expect(result.detectedTypes).toContain('OpenAI / Anthropic Secret Key');
    expect(result.redactedText).toBe('OPENAI_API_KEY=[REDACTED:AI_API_KEY]');
  });

  it('redacts password parameters in config files or queries', () => {
    const text = 'db_user=admin\npassword="SuperSecretPassword123!"\nhost=localhost';
    const result = redactSensitiveText(text);

    expect(result.hasSecrets).toBe(true);
    expect(result.redactedText).toContain('password="[REDACTED:PASSWORD]"');
    expect(result.redactedText).toContain('db_user=admin');
    expect(result.redactedText).toContain('host=localhost');
  });

  it('redacts credentials in database connection URIs', () => {
    const uri = 'postgres://postgres:SuperSecretDbPassword@db.internal:5432/production';
    const result = redactSensitiveText(uri);

    expect(result.hasSecrets).toBe(true);
    expect(result.redactedText).toBe('postgres://postgres:[REDACTED:DB_PASSWORD]@db.internal:5432/production');
  });

  it('redacts PEM private key blocks', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    const result = redactSensitiveText(pem);

    expect(result.hasSecrets).toBe(true);
    expect(result.redactedText).toBe('[REDACTED:PRIVATE_KEY_BLOCK]');
  });

  it('leaves benign non-sensitive text completely intact', () => {
    const safeText = 'function calculateTotal(price: number, tax: number) { return price * (1 + tax); }';
    const result = redactSensitiveText(safeText);

    expect(result.hasSecrets).toBe(false);
    expect(result.redactedText).toBe(safeText);
    expect(result.detectedCount).toBe(0);
  });
});
