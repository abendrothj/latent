import { beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
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

// Setup before each test
beforeEach(() => {
  // Ensure test directories exist before each test
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_VAULT_DIR)) {
    fs.mkdirSync(TEST_VAULT_DIR, { recursive: true });
  }
});

// Cleanup after each test
afterEach(() => {
  // Remove test vault files (but keep the directory to avoid race conditions)
  if (fs.existsSync(TEST_VAULT_DIR)) {
    try {
      const files = fs.readdirSync(TEST_VAULT_DIR);
      for (const file of files) {
        const filePath = path.join(TEST_VAULT_DIR, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  // Remove test database file if it exists
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch (error) {
      // Ignore errors (file may be locked)
    }
  }
});

// Cleanup after all tests
afterAll(() => {
  // Remove test directory
  if (fs.existsSync(TEST_DIR)) {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      // Retry once after a short delay, ignore errors if it still fails
      try {
        // Best effort: change permissions recursively then try remove again
        const entries = fs.readdirSync(TEST_DIR);
        for (const entry of entries) {
          const entryPath = path.join(TEST_DIR, entry);
          try {
            fs.chmodSync(entryPath, 0o700);
          } catch (e) {
            // ignore chmod errors
          }
        }
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      } catch (e) {
        // Ignore failures during cleanup to avoid flakiness in test environment
      }
    }
  }
});
