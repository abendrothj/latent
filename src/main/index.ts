import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './db/schema';
import { Indexer } from './indexer';
import { createVercelAIProvider } from './ai/provider';
import { setVaultPath, setLLMProvider, ALL_TOOLS, executeToolCall } from './ai/tools';
import { getSetting, setSetting, getAllSettings, getAllDocuments } from './db/queries';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, IPC_CHANNELS } from '../shared/constants';
import type { ProviderConfig, Message, IndexProgress } from '../shared/types';

// Global state
let mainWindow: BrowserWindow | null = null;
let indexer: Indexer | null = null;
let llmProvider: any = null;

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
    // Initialize database
    initDatabase();
    console.log('[Main] Database initialized');

    // Load settings
    await loadSettings();

    // Create window
    createWindow();

    // Set up IPC handlers
    setupIPCHandlers();

    console.log('[Main] Application ready');
  } catch (error) {
    console.error('[Main] Initialization error:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.env.NODE_ENV !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', async () => {
  // Stop indexer
  if (indexer) {
    indexer.stop();
  }

  // Close database
  closeDatabase();
});

// Load and apply settings
async function loadSettings() {
  const settings = getAllSettings();

  // Load AI provider config
  const providerConfig: ProviderConfig = settings[SETTINGS_KEYS.AI_PROVIDER]
    ? JSON.parse(settings[SETTINGS_KEYS.AI_PROVIDER])
    : DEFAULT_SETTINGS.ai.provider;

  // Check for environment variables (for development)
  if (!providerConfig.apiKey && process.env.OPENAI_API_KEY) {
    providerConfig.apiKey = process.env.OPENAI_API_KEY;
    providerConfig.type = 'openai';
  }

  if (!providerConfig.baseURL && process.env.OLLAMA_BASE_URL) {
    providerConfig.baseURL = process.env.OLLAMA_BASE_URL;
  }

  // Create AI provider if configured
  if (providerConfig.apiKey || providerConfig.type === 'ollama') {
    try {
      llmProvider = createVercelAIProvider(providerConfig);
      setLLMProvider(llmProvider);
      console.log(`[Main] LLM provider initialized: ${providerConfig.type}`);
    } catch (error: any) {
      console.error('[Main] Failed to initialize LLM provider:', error);
    }
  }

  // Load vault path
  const vaultPath =
    settings[SETTINGS_KEYS.VAULT_PATH] || DEFAULT_SETTINGS.vault.path;
  const resolvedVaultPath = path.resolve(app.getPath('userData'), vaultPath);

  setVaultPath(resolvedVaultPath);

  // Create vault directory if it doesn't exist
  if (!fs.existsSync(resolvedVaultPath)) {
    fs.mkdirSync(resolvedVaultPath, { recursive: true });
    console.log(`[Main] Created vault directory: ${resolvedVaultPath}`);
  }

  // Initialize indexer
  indexer = new Indexer(resolvedVaultPath, {
    chunkSize: DEFAULT_SETTINGS.indexer.chunkSize,
    chunkOverlap: DEFAULT_SETTINGS.indexer.chunkOverlap,
    onProgress: (progress: IndexProgress) => {
      // Send progress to renderer
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.INDEXER_PROGRESS, progress);
      }
    },
  });

  if (llmProvider) {
    indexer.setProvider(llmProvider);
  }

  // Start indexer if auto-index is enabled
  if (DEFAULT_SETTINGS.indexer.autoIndex) {
    await indexer.start();
    console.log('[Main] Indexer started');
  }
}

// IPC Handlers
function setupIPCHandlers() {
  // Settings
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async () => {
    return getAllSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SET_SETTINGS, async (_, key: string, value: string) => {
    setSetting(key, value);
    return { success: true };
  });

  // Documents
  ipcMain.handle(IPC_CHANNELS.LIST_DOCUMENTS, async () => {
    return getAllDocuments();
  });

  // Tools
  ipcMain.handle(IPC_CHANNELS.READ_NOTE, async (_, args) => {
    return await executeToolCall({
      id: 'ipc',
      type: 'function',
      function: { name: 'read_note', arguments: JSON.stringify(args) },
    });
  });

  ipcMain.handle(IPC_CHANNELS.SEARCH_NOTES, async (_, args) => {
    return await executeToolCall({
      id: 'ipc',
      type: 'function',
      function: { name: 'search_notes', arguments: JSON.stringify(args) },
    });
  });

  ipcMain.handle(IPC_CHANNELS.WRITE_NOTE, async (_, args) => {
    return await executeToolCall({
      id: 'ipc',
      type: 'function',
      function: { name: 'write_note', arguments: JSON.stringify(args) },
    });
  });

  ipcMain.handle(IPC_CHANNELS.UPDATE_FRONTMATTER, async (_, args) => {
    return await executeToolCall({
      id: 'ipc',
      type: 'function',
      function: { name: 'update_frontmatter', arguments: JSON.stringify(args) },
    });
  });

  ipcMain.handle(IPC_CHANNELS.LIST_BACKLINKS, async (_, args) => {
    return await executeToolCall({
      id: 'ipc',
      type: 'function',
      function: { name: 'list_backlinks', arguments: JSON.stringify(args) },
    });
  });

  // AI Chat
  ipcMain.handle(IPC_CHANNELS.CHAT, async (_, messages: Message[]) => {
    if (!llmProvider) {
      throw new Error('LLM provider not configured');
    }

    return await llmProvider.chat({
      messages,
      tools: ALL_TOOLS,
      tool_choice: 'auto',
    });
  });

  // AI Chat Streaming
  ipcMain.handle(IPC_CHANNELS.CHAT_STREAM, async (event, messages: Message[]) => {
    if (!llmProvider) {
      throw new Error('LLM provider not configured');
    }

    try {
      for await (const chunk of llmProvider.streamChat({
        messages,
        tools: ALL_TOOLS,
        tool_choice: 'auto',
      })) {
        event.sender.send(`${IPC_CHANNELS.CHAT_STREAM}:chunk`, chunk);
      }
      event.sender.send(`${IPC_CHANNELS.CHAT_STREAM}:done`);
    } catch (error: any) {
      event.sender.send(`${IPC_CHANNELS.CHAT_STREAM}:error`, error.message);
    }
  });

  // Indexer
  ipcMain.handle(IPC_CHANNELS.START_INDEXER, async () => {
    if (indexer) {
      await indexer.start();
      return { success: true };
    }
    throw new Error('Indexer not initialized');
  });

  ipcMain.handle(IPC_CHANNELS.STOP_INDEXER, async () => {
    if (indexer) {
      indexer.stop();
      return { success: true };
    }
    throw new Error('Indexer not initialized');
  });

  ipcMain.handle(IPC_CHANNELS.REINDEX_ALL, async () => {
    if (indexer) {
      await indexer.reindexAll();
      return { success: true };
    }
    throw new Error('Indexer not initialized');
  });

  // Vault
  ipcMain.handle(IPC_CHANNELS.GET_VAULT_PATH, async () => {
    return getSetting(SETTINGS_KEYS.VAULT_PATH) || DEFAULT_SETTINGS.vault.path;
  });

  ipcMain.handle(IPC_CHANNELS.SET_VAULT_PATH, async (_, vaultPath: string) => {
    setSetting(SETTINGS_KEYS.VAULT_PATH, vaultPath);

    // Restart indexer with new path
    if (indexer) {
      indexer.stop();
    }

    const resolvedPath = path.resolve(vaultPath);
    setVaultPath(resolvedPath);

    indexer = new Indexer(resolvedPath, {
      onProgress: (progress) => {
        if (mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.INDEXER_PROGRESS, progress);
        }
      },
    });

    if (llmProvider) {
      indexer.setProvider(llmProvider);
    }

    await indexer.start();

    return { success: true };
  });

  console.log('[Main] IPC handlers registered');
}
