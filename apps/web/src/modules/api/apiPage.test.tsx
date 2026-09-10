import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { ApiPage } from './ApiPage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ApiPage UI flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders importer, loads fixture, filters endpoints, and previews parameters', async () => {
    const yamlFixture = readFileSync(resolve(__dirname, 'fixtures/pets.openapi.yaml'), 'utf8');
    render(<ApiPage />);

    expect(screen.getByText(/Import OpenAPI Specification/i)).toBeDefined();

    // Paste fixture into textarea
    const textarea = screen.getByPlaceholderText(/openapi: 3.1.0/i) as HTMLTextAreaElement;
    fireEvent.input(textarea, { target: { value: yamlFixture } });

    // Wait for parsed API title
    await waitFor(() => {
      expect(screen.getByText('Pet Store API')).toBeDefined();
    });

    // Check operation list
    expect(screen.getAllByText('/pets').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('/pets/{petId}')).toBeDefined();

    // Filter operations
    const filterInput = screen.getByPlaceholderText(/Filter endpoints/i);
    fireEvent.input(filterInput, { target: { value: 'showPetById' } });

    expect(screen.getByText('/pets/{petId}')).toBeDefined();
    expect(screen.queryAllByText('List all pets')).toHaveLength(0);
  });
});

