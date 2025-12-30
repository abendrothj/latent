import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import type { IndexProgress } from '../../shared/types';
import { WATCH_PATTERNS, IGNORED_PATTERNS, DEBOUNCE_DELAY_MS } from '../../shared/constants';

export type FileEventType = 'add' | 'change' | 'unlink';

export interface FileEvent {
  type: FileEventType;
  path: string;
  timestamp: number;
}

export type FileEventCallback = (event: FileEvent) => void | Promise<void>;
export type ProgressCallback = (progress: IndexProgress) => void;

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private eventQueue: Map<string, FileEvent> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;
  private onEvent: FileEventCallback | null = null;
  private onProgress: ProgressCallback | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private knownFiles: Map<string, number> = new Map(); // relativePath -> mtimeMs

  constructor(
    private vaultPath: string,
    private options?: {
      patterns?: string[];
      ignored?: RegExp[];
      debounceDelay?: number;
    }
  ) {}

  start(onEvent: FileEventCallback, onProgress?: ProgressCallback): void {
    if (this.watcher) {
      throw new Error('Watcher is already running');
    }

    this.onEvent = onEvent;
    this.onProgress = onProgress;

    // Create ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });

    const patterns = this.options?.patterns || WATCH_PATTERNS;
    const watchPaths = patterns.map((pattern) => path.join(this.vaultPath, pattern));

    console.log(`[Watcher] Starting file watcher on: ${this.vaultPath}`);
    console.log(`[Watcher] Watching patterns:`, patterns);

    this.watcher = chokidar.watch(watchPaths, {
      ignored: this.options?.ignored || IGNORED_PATTERNS,
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath) => this.enqueueEvent('add', filePath))
      .on('change', (filePath) => this.enqueueEvent('change', filePath))
      .on('unlink', (filePath) => this.enqueueEvent('unlink', filePath))
      .on('ready', async () => {
        console.log('[Watcher] Initial scan complete, watching for changes...');
          // Initialize knownFiles map by doing an initial scan
        try {
          await this.scanForChanges();
        } catch (e) {
          console.error('[Watcher] Failed to initialize known files:', e);
        }

        // Start polling as a fallback for missing FS events
        this.pollTimer = setInterval(() => this.scanForChanges(), 500);

        if (this.readyResolve) {
          this.readyResolve();
        }
      })
      .on('error', (error) => {
        console.error('[Watcher] Error:', error);
      });
  }

  stop(): void {
    if (this.watcher) {
      console.log('[Watcher] Stopping file watcher');
      this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.eventQueue.clear();
  }

  private enqueueEvent(type: FileEventType, filePath: string): void {
    // Convert absolute path to relative path from vault
    const relativePath = path.relative(this.vaultPath, filePath);

    console.log(`[Watcher] File ${type}: ${relativePath}`);

    // Add or update event in queue (deduplicate by path)
    this.eventQueue.set(relativePath, {
      type,
      path: relativePath,
      timestamp: Date.now(),
    });

    // Debounce: wait for changes to settle before processing
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(
      () => this.processQueue(),
      this.options?.debounceDelay || DEBOUNCE_DELAY_MS
    );
  }

  private async processQueue(): Promise<void> {
    if (this.eventQueue.size === 0) {
      return;
    }

    const events = Array.from(this.eventQueue.values());
    this.eventQueue.clear();

    console.log(`[Watcher] Processing ${events.length} file event(s)`);

    if (this.onProgress) {
      this.onProgress({
        phase: 'indexing',
        current: 0,
        total: events.length,
      });
    }

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      try {
        if (this.onEvent) {
          await this.onEvent(event);
        }

        // Update knownFiles map for add/change/unlink
        if (event.type === 'add' || event.type === 'change') {
          try {
            const full = path.join(this.vaultPath, event.path);
            const st = await fs.stat(full);
            this.knownFiles.set(event.path, st.mtimeMs);
          } catch (e) {
            // ignore stat errors
            this.knownFiles.delete(event.path);
          }
        } else if (event.type === 'unlink') {
          this.knownFiles.delete(event.path);
        }

        if (this.onProgress) {
          this.onProgress({
            phase: 'indexing',
            current: i + 1,
            total: events.length,
            currentFile: event.path,
          });
        }
      } catch (error: any) {
        console.error(`[Watcher] Error processing ${event.path}:`, error);

        if (this.onProgress) {
          this.onProgress({
            phase: 'error',
            current: i + 1,
            total: events.length,
            currentFile: event.path,
            error: error.message,
          });
        }
      }
    }

    if (this.onProgress) {
      this.onProgress({
        phase: 'complete',
        current: events.length,
        total: events.length,
      });
    }

    console.log('[Watcher] Queue processing complete');
  }

  // Polling fallback: scan the vault and enqueue events for any changes missed by chokidar
  private async scanForChanges(): Promise<void> {
    const current: Map<string, number> = new Map();

    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        // Skip dotfiles
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          await walk(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const relativePath = path.relative(this.vaultPath, entryPath);
          try {
            const st = await fs.stat(entryPath);
            current.set(relativePath, st.mtimeMs);
          } catch (e) {
            // ignore stat errors
          }
        }
      }
    };

    try {
      await walk(this.vaultPath);
    } catch (error: any) {
      console.error('[Watcher] Error while polling vault:', error);
      return;
    }

    // Detect new or changed files
    for (const [rel, mtime] of current.entries()) {
      const known = this.knownFiles.get(rel);
      const full = path.join(this.vaultPath, rel);

      if (known === undefined) {
        // New file
        this.enqueueEvent('add', full);
      } else if (known !== mtime) {
        // Modified file
        this.enqueueEvent('change', full);
      }
    }

    // Detect deleted files
    for (const rel of Array.from(this.knownFiles.keys())) {
      if (!current.has(rel)) {
        const full = path.join(this.vaultPath, rel);
        this.enqueueEvent('unlink', full);
      }
    }

    // Replace knownFiles with current snapshot
    this.knownFiles = current;
  }

  /**
   * Manually trigger indexing of all files (for initial scan)
   */
  async indexAll(): Promise<void> {
    if (!this.watcher) {
      throw new Error('Watcher not started');
    }

    // Wait for initial scan to complete
    if (this.readyPromise) {
      await this.readyPromise;
    }

    const allFiles: string[] = [];

    // Walk the vault directory directly to avoid relying on chokidar internal state
    const walk = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);

        // Skip dotfiles/directories
        if (entry.name.startsWith('.')) continue;

        if (entry.isDirectory()) {
          await walk(entryPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const relativePath = path.relative(this.vaultPath, entryPath);
          allFiles.push(relativePath);
        }
      }
    };

    try {
      await walk(this.vaultPath);
    } catch (error: any) {
      console.error('[Watcher] Error while scanning vault:', error);
    }

    // Initialize known files map if empty
    for (const f of allFiles) {
      try {
        const st = await fs.stat(path.join(this.vaultPath, f));
        this.knownFiles.set(f, st.mtimeMs);
      } catch (e) {
        // ignore
      }
    }

    console.log(`[Watcher] Indexing ${allFiles.length} files...`);

    if (this.onProgress) {
      this.onProgress({
        phase: 'scanning',
        current: 0,
        total: allFiles.length,
      });
    }

    // Process files sequentially
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];

      try {
        if (this.onEvent) {
          await this.onEvent({ type: 'add', path: filePath, timestamp: Date.now() });
        }

        if (this.onProgress) {
          this.onProgress({
            phase: 'indexing',
            current: i + 1,
            total: allFiles.length,
            currentFile: filePath,
          });
        }
      } catch (error: any) {
        console.error(`[Watcher] Error indexing ${filePath}:`, error);
      }
    }

    if (this.onProgress) {
      this.onProgress({ phase: 'complete', current: allFiles.length, total: allFiles.length });
    }
  }
}
