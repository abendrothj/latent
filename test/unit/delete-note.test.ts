import { beforeAll, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TEST_VAULT_DIR } from '../setup';
import { setVaultPath, executeToolCall } from '../../src/main/ai/tools';

beforeAll(() => {
  setVaultPath(TEST_VAULT_DIR);
  if (!fs.existsSync(TEST_VAULT_DIR)) fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
});

test('delete_note tool deletes a file on disk', async () => {
  const name = 'to-delete.md';
  const full = path.join(TEST_VAULT_DIR, name);

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