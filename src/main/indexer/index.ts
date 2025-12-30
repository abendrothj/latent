/**
 * Indexer Main Module
 * Coordinates file watching, parsing, chunking, embedding, and database storage
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { FileWatcher, type FileEvent } from './watcher';
import { parseMarkdown, countWords } from './parser';
import { chunkDocument } from './chunker';
import { indexDocument, getDocumentByPath, deleteDocument } from '../db/queries';
import type { IndexProgress } from '../../shared/types';
import { LLMProvider } from '../ai/provider';

export class Indexer {
  private watcher: FileWatcher | null = null;
  private provider: LLMProvider | null = null;
  private vaultPath: string;
  private isRunning: boolean = false;

  constructor(
    vaultPath: string,
    private options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      onProgress?: (progress: IndexProgress) => void;
    }
  ) {
    this.vaultPath = vaultPath;
  }

  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Indexer] Already running');
      return;
    }

    console.log(`[Indexer] Starting indexer for vault: ${this.vaultPath}`);

    // Verify vault path exists
    try {
      await fs.access(this.vaultPath);
    } catch (error) {
      throw new Error(`Vault path does not exist: ${this.vaultPath}`);
    }

    this.isRunning = true;

    // Start file watcher
    this.watcher = new FileWatcher(this.vaultPath);
    this.watcher.start(
      (event) => this.handleFileEvent(event),
      this.options?.onProgress
    );

    // Perform initial indexing of all files
    await this.watcher.indexAll();
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[Indexer] Stopping indexer');

    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }

    this.isRunning = false;
  }

  private async handleFileEvent(event: FileEvent): Promise<void> {
    console.log(`[Indexer] Handling ${event.type} event for: ${event.path}`);

    switch (event.type) {
      case 'add':
      case 'change':
        await this.indexFile(event.path);
        break;

      case 'unlink':
        await this.deleteFile(event.path);
        break;
    }
  }

  private async indexFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.vaultPath, relativePath);

    try {
      // Read file
      const content = await fs.readFile(fullPath, 'utf-8');

      // Calculate checksum
      const checksum = crypto.createHash('sha256').update(content).digest('hex');

      // Check if file has changed
      const existing = getDocumentByPath(relativePath);
      if (existing && existing.checksum === checksum) {
        console.log(`[Indexer] File unchanged, skipping: ${relativePath}`);
        return;
      }

      // Get file stats
      const stats = await fs.stat(fullPath);

      // Parse markdown
      const parsed = await parseMarkdown(content);

      // Count words
      const wordCount = countWords(parsed.content);

      // Chunk content
      const chunks = await chunkDocument(
        parsed.content,
        this.options?.chunkSize,
        this.options?.chunkOverlap
      );

      console.log(`[Indexer] Chunked ${relativePath} into ${chunks.length} chunk(s)`);

      // Generate embeddings
      let embeddings: (number[] | null)[];
      let embeddingModel: string = 'none';

      if (this.provider && chunks.length > 0) {
        try {
          console.log(`[Indexer] Generating embeddings for ${chunks.length} chunk(s)...`);

          // Batch embeddings for efficiency
          const chunkTexts = chunks.map((c) => c.content);
          const embedResponse = await this.provider.embed({ input: chunkTexts });

          embeddings = embedResponse.embeddings;
          embeddingModel = embedResponse.model;

          console.log(`[Indexer] Embeddings generated using model: ${embeddingModel}`);
        } catch (error: any) {
          console.warn(`[Indexer] Failed to generate embeddings: ${error.message}`);
          console.warn('[Indexer] Storing document without embeddings');
          embeddings = chunks.map(() => null);
        }
      } else {
        console.warn('[Indexer] No provider configured, storing without embeddings');
        embeddings = chunks.map(() => null);
      }

      // Store in database
      indexDocument({
        path: relativePath,
        checksum,
        title: parsed.title,
        wordCount,
        createdAt: Math.floor(stats.birthtimeMs / 1000),
        modifiedAt: Math.floor(stats.mtimeMs / 1000),
        frontmatter: parsed.frontmatter,
        chunks,
        embeddings,
        embeddingModel,
        links: parsed.links,
      });

      console.log(`[Indexer] Successfully indexed: ${relativePath}`);
    } catch (error: any) {
      console.error(`[Indexer] Failed to index ${relativePath}:`, error);
      throw error;
    }
  }

  private async deleteFile(relativePath: string): Promise<void> {
    try {
      deleteDocument(relativePath);
      console.log(`[Indexer] Deleted document: ${relativePath}`);
    } catch (error: any) {
      console.error(`[Indexer] Failed to delete ${relativePath}:`, error);
      throw error;
    }
  }

  /**
   * Manually reindex a specific file
   */
  async reindexFile(relativePath: string): Promise<void> {
    await this.indexFile(relativePath);
  }

  /**
   * Reindex all files in vault
   */
  async reindexAll(): Promise<void> {
    if (this.watcher) {
      await this.watcher.indexAll();
    } else {
      throw new Error('Watcher not started');
    }
  }
}
