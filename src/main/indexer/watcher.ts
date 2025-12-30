import chokidar from 'chokidar';
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

    const patterns = this.options?.patterns || WATCH_PATTERNS;
    const watchPaths = patterns.map((pattern) => path.join(this.vaultPath, pattern));

    console.log(`[Watcher] Starting file watcher on: ${this.vaultPath}`);
    console.log(`[Watcher] Watching patterns:`, patterns);

    this.watcher = chokidar.watch(watchPaths, {
      ignored: this.options?.ignored || IGNORED_PATTERNS,
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath) => this.enqueueEvent('add', filePath))
      .on('change', (filePath) => this.enqueueEvent('change', filePath))
      .on('unlink', (filePath) => this.enqueueEvent('unlink', filePath))
      .on('ready', () => {
        console.log('[Watcher] Initial scan complete, watching for changes...');
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

  /**
   * Manually trigger indexing of all files (for initial scan)
   */
  async indexAll(): Promise<void> {
    if (!this.watcher) {
      throw new Error('Watcher not started');
    }

    const watched = this.watcher.getWatched();
    const allFiles: string[] = [];

    // Collect all watched files
    for (const [dir, files] of Object.entries(watched)) {
      for (const file of files) {
        if (file.endsWith('.md')) {
          const fullPath = path.join(dir, file);
          const relativePath = path.relative(this.vaultPath, fullPath);
          allFiles.push(relativePath);
        }
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

    // Process files in batches
    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];

      try {
        if (this.onEvent) {
          await this.onEvent({
            type: 'add',
            path: filePath,
            timestamp: Date.now(),
          });
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
      this.onProgress({
        phase: 'complete',
        current: allFiles.length,
        total: allFiles.length,
      });
    }
  }
}
