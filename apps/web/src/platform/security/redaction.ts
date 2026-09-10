export interface RedactionResult {
  hasSecrets: boolean;
  redactedText: string;
  detectedCount: number;
  detectedTypes: string[];
}

interface RedactionRule {
  type: string;
  pattern: RegExp;
  replacement: (match: string, ...groups: string[]) => string;
}

const REDACTION_RULES: RedactionRule[] = [
  {
    type: 'Private Key Block',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: () => '[REDACTED:PRIVATE_KEY_BLOCK]',
  },
  {
    type: 'GitHub Token',
    pattern: /\b(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g,
    replacement: () => '[REDACTED:GITHUB_TOKEN]',
  },
  {
    type: 'OpenAI / Anthropic Secret Key',
    pattern: /\b(sk-[A-Za-z0-9\-_]{20,})\b/g,
    replacement: () => '[REDACTED:AI_API_KEY]',
  },
  {
    type: 'GitLab PAT',
    pattern: /\b(glpat-[A-Za-z0-9\-]{20,})\b/g,
    replacement: () => '[REDACTED:GITLAB_TOKEN]',
  },
  {
    type: 'Authorization: Bearer',
    pattern: /(Authorization:\s*Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: (_match, prefix) => `${prefix}[REDACTED:BEARER_TOKEN]`,
  },
  {
    type: 'Database Connection String',
    pattern: /\b((?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^:\s]+:)([^@\s]+)(@[^\s]+)/gi,
    replacement: (_match, prefix, _pass, suffix) => `${prefix}[REDACTED:DB_PASSWORD]${suffix}`,
  },
  {
    type: 'Password Parameter',
    pattern: /((?:password|pwd|pass|secret)\s*[:=]\s*["']?)([^"'\s&]+)(["']?)/gi,
    replacement: (_match, prefix, secret, suffix) =>
      secret.startsWith('[REDACTED:') ? _match : `${prefix}[REDACTED:PASSWORD]${suffix}`,
  },
  {
    type: 'API Key Parameter',
    pattern: /((?:api_key|apikey|access_token)\s*[:=]\s*["']?)([^"'\s&]+)(["']?)/gi,
    replacement: (_match, prefix, secret, suffix) =>
      secret.startsWith('[REDACTED:') ? _match : `${prefix}[REDACTED:API_KEY]${suffix}`,
  },
];

export function redactSensitiveText(input: string): RedactionResult {
  let text = input;
  const detectedTypes = new Set<string>();
  let detectedCount = 0;

  for (const rule of REDACTION_RULES) {
    const matches = text.match(rule.pattern);
    if (matches && matches.length > 0) {
      detectedTypes.add(rule.type);
      detectedCount += matches.length;
      text = text.replace(rule.pattern, rule.replacement as (...args: unknown[]) => string);
    }
  }

  return {
    hasSecrets: detectedCount > 0,
    redactedText: text,
    detectedCount,
    detectedTypes: Array.from(detectedTypes),
  };
}
