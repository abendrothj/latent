import { beforeAll, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TEST_VAULT_DIR } from '../setup';
import { setVaultPath, executeToolCall } from '../../src/main/ai/tools';

beforeAll(() => {
  setVaultPath(TEST_VAULT_DIR);
  // Ensure test vault exists in case other tests cleaned it up
  if (!fs.existsSync(TEST_VAULT_DIR)) fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
});

test('rename_note tool renames a file on disk', async () => {
  const oldName = 'old-note.md';
  const newName = 'renamed-note.md';
  const oldPath = path.join(TEST_VAULT_DIR, oldName);
  const newPath = path.join(TEST_VAULT_DIR, newName);

  // Ensure directory exists, then write initial file
  fs.mkdirSync(path.dirname(oldPath), { recursive: true });
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