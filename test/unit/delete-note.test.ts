import { beforeAll, afterAll, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { setVaultPath, executeToolCall } from '../../src/main/ai/tools';

// Use a unique temp directory for this test file to avoid conflicts
const TEST_VAULT_DIR = path.join(tmpdir(), `latent-delete-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

beforeAll(() => {
  // Create unique test vault for this test file
  if (!fs.existsSync(TEST_VAULT_DIR)) {
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
  }
  setVaultPath(TEST_VAULT_DIR);
});

afterAll(() => {
  // Clean up test vault after all tests in this file
  if (fs.existsSync(TEST_VAULT_DIR)) {
    fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
  }
});

test('delete_note tool deletes a file on disk', async () => {
  const name = 'to-delete.md';
  const full = path.join(TEST_VAULT_DIR, name);

  // Ensure vault directory exists (defensive programming for parallel test execution)
  if (!fs.existsSync(TEST_VAULT_DIR)) {
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
  }

  fs.writeFileSync(full, '# Delete me\n\nContent');
  expect(fs.existsSync(full)).toBe(true);

  const res = await executeToolCall({
    id: 'test',
    type: 'function',
    function: { name: 'delete_note', arguments: JSON.stringify({ path: name }) },
  } as any);

  expect(res).toMatch(/Deleted/);
  expect(fs.existsSync(full)).toBe(false);
});