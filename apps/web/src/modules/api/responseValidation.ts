import Ajv from 'ajv';

export interface ValidationIssue {
  path: string;
  message: string;
  keyword: string;
  params?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validates a response value against an OpenAPI / JSON Schema definition using Ajv 2020.
 * Operates purely client-side with network schema loading disabled.
 */
export function validateResponse(schema: Record<string, unknown>, value: unknown): ValidationResult {
  if (!schema || typeof schema !== 'object') {
    return { valid: true, issues: [] };
  }

  try {
    const ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
      loadSchema: async () => {
        throw new Error('Remote schema resolution is disabled for security.');
      },
    });

    const validate = ajv.compile(schema);
    const valid = validate(value) as boolean;

    if (valid || !validate.errors) {
      return { valid: true, issues: [] };
    }

    const issues: ValidationIssue[] = validate.errors.map((err) => ({
      path: err.instancePath || '/',
      message: err.message || 'Validation failed',
      keyword: err.keyword,
      params: err.params as Record<string, unknown>,
    }));

    return {
      valid: false,
      issues,
    };
  } catch (err) {
    return {
      valid: false,
      issues: [
        {
          path: '/',
          message: err instanceof Error ? `Schema compilation error: ${err.message}` : 'Failed to validate schema.',
          keyword: 'compiler',
        },
      ],
    };
  }
}
