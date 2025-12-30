import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/constants';
import type {
  Message,
  SearchNotesArgs,
  ReadNoteArgs,
  WriteNoteArgs,
  UpdateFrontmatterArgs,
  ListBacklinksArgs,
  IndexProgress,
} from './shared/types';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, key, value),

  // Tools
  readNote: (args: ReadNoteArgs) => ipcRenderer.invoke(IPC_CHANNELS.READ_NOTE, args),
  searchNotes: (args: SearchNotesArgs) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_NOTES, args),
  writeNote: (args: WriteNoteArgs) => ipcRenderer.invoke(IPC_CHANNELS.WRITE_NOTE, args),
  updateFrontmatter: (args: UpdateFrontmatterArgs) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_FRONTMATTER, args),
  listBacklinks: (args: ListBacklinksArgs) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_BACKLINKS, args),

  // AI
  chat: (messages: Message[]) => ipcRenderer.invoke(IPC_CHANNELS.CHAT, messages),

  // Indexer
  startIndexer: () => ipcRenderer.invoke(IPC_CHANNELS.START_INDEXER),
  stopIndexer: () => ipcRenderer.invoke(IPC_CHANNELS.STOP_INDEXER),
  reindexAll: () => ipcRenderer.invoke(IPC_CHANNELS.REINDEX_ALL),
  onIndexerProgress: (callback: (progress: IndexProgress) => void) => {
    ipcRenderer.on(IPC_CHANNELS.INDEXER_PROGRESS, (_, progress) => callback(progress));
    return () => ipcRenderer.removeAllListeners(IPC_CHANNELS.INDEXER_PROGRESS);
  },

  // Vault
  getVaultPath: () => ipcRenderer.invoke(IPC_CHANNELS.GET_VAULT_PATH),
  setVaultPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_VAULT_PATH, path),
});

// TypeScript declarations
declare global {
  interface Window {
    electron: {
      getSettings: () => Promise<Record<string, string>>;
      setSetting: (key: string, value: string) => Promise<{ success: boolean }>;
      readNote: (args: ReadNoteArgs) => Promise<string>;
      searchNotes: (args: SearchNotesArgs) => Promise<any>;
      writeNote: (args: WriteNoteArgs) => Promise<string>;
      updateFrontmatter: (args: UpdateFrontmatterArgs) => Promise<string>;
      listBacklinks: (args: ListBacklinksArgs) => Promise<any>;
      chat: (messages: Message[]) => Promise<any>;
      startIndexer: () => Promise<{ success: boolean }>;
      stopIndexer: () => Promise<{ success: boolean }>;
      reindexAll: () => Promise<{ success: boolean }>;
      onIndexerProgress: (callback: (progress: IndexProgress) => void) => () => void;
      getVaultPath: () => Promise<string>;
      setVaultPath: (path: string) => Promise<{ success: boolean }>;
    };
  }
}
