import { beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Test data directories
export const TEST_DIR = path.join(__dirname, '.tmp');
export const TEST_VAULT_DIR = path.join(TEST_DIR, 'vault');
export const TEST_DB_PATH = path.join(TEST_DIR, 'test.db');

// Setup before all tests
beforeAll(() => {
  // Create test directories
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_VAULT_DIR)) {
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
  }
});

// Cleanup after each test
afterEach(() => {
  // Remove test vault files
  if (fs.existsSync(TEST_VAULT_DIR)) {
    fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
  }
});

// Cleanup after all tests
afterAll(() => {
  // Remove test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});
