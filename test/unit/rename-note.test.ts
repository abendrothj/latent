import { beforeAll, afterAll, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { setVaultPath, executeToolCall } from '../../src/main/ai/tools';

// Use a unique temp directory for this test file to avoid conflicts
const TEST_VAULT_DIR = path.join(tmpdir(), `latent-rename-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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

test('rename_note tool renames a file on disk', async () => {
  const oldName = 'old-note.md';
  const newName = 'renamed-note.md';
  const oldPath = path.join(TEST_VAULT_DIR, oldName);
  const newPath = path.join(TEST_VAULT_DIR, newName);

  // Ensure vault directory exists (defensive programming for parallel test execution)
  if (!fs.existsSync(TEST_VAULT_DIR)) {
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
  }

  // Write initial file
  fs.writeFileSync(oldPath, '# Old Title\n\nContent');
  expect(fs.existsSync(oldPath)).toBe(true);

  // Execute rename_note tool
  const res = await executeToolCall({
    id: 'test',
    type: 'function',
    function: { name: 'rename_note', arguments: JSON.stringify({ oldPath: oldName, newPath: newName }) },
  } as any);

  // Validate result
  expect(res).toMatch(/Renamed/);
  expect(fs.existsSync(newPath)).toBe(true);
  expect(fs.existsSync(oldPath)).toBe(false);
});