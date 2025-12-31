import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from './shared/constants';
import type {
  Message,
  SearchNotesArgs,
  ReadNoteArgs,
  WriteNoteArgs,
  RenameNoteArgs,
  UpdateFrontmatterArgs,
  ListBacklinksArgs,
  IndexProgress,
  Document,
} from './shared/types';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, key, value),

  // Documents
  listDocuments: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_DOCUMENTS),

  // Tools
  readNote: (args: ReadNoteArgs) => ipcRenderer.invoke(IPC_CHANNELS.READ_NOTE, args),
  searchNotes: (args: SearchNotesArgs) => ipcRenderer.invoke(IPC_CHANNELS.SEARCH_NOTES, args),
  writeNote: (args: WriteNoteArgs) => ipcRenderer.invoke(IPC_CHANNELS.WRITE_NOTE, args),
  renameNote: (args: RenameNoteArgs) => ipcRenderer.invoke(IPC_CHANNELS.RENAME_NOTE, args),
  deleteNote: (args: DeleteNoteArgs) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_NOTE, args),
  showContextMenu: (options: { items: { label: string; id: string }[]; x?: number; y?: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHOW_CONTEXT_MENU, options),
  updateFrontmatter: (args: UpdateFrontmatterArgs) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_FRONTMATTER, args),
  listBacklinks: (args: ListBacklinksArgs) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_BACKLINKS, args),

  // AI
  chat: (messages: Message[]) => ipcRenderer.invoke(IPC_CHANNELS.CHAT, messages),
  streamChat: (
    messages: Message[],
    onChunk: (chunk: any) => void,
    onDone: () => void,
    onError: (error: string) => void
  ) => {
    const chunkListener = (_: any, chunk: any) => onChunk(chunk);
    const doneListener = () => {
      cleanup();
      onDone();
    };
    const errorListener = (_: any, error: string) => {
      cleanup();
      onError(error);
    };

    const cleanup = () => {
      ipcRenderer.removeListener(`${IPC_CHANNELS.CHAT_STREAM}:chunk`, chunkListener);
      ipcRenderer.removeListener(`${IPC_CHANNELS.CHAT_STREAM}:done`, doneListener);
      ipcRenderer.removeListener(`${IPC_CHANNELS.CHAT_STREAM}:error`, errorListener);
    };

    ipcRenderer.on(`${IPC_CHANNELS.CHAT_STREAM}:chunk`, chunkListener);
    ipcRenderer.once(`${IPC_CHANNELS.CHAT_STREAM}:done`, doneListener);
    ipcRenderer.once(`${IPC_CHANNELS.CHAT_STREAM}:error`, errorListener);

    ipcRenderer.invoke(IPC_CHANNELS.CHAT_STREAM, messages);

    return cleanup;
  },

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
      listDocuments: () => Promise<Document[]>;
      readNote: (args: ReadNoteArgs) => Promise<string>;
      searchNotes: (args: SearchNotesArgs) => Promise<any>;
      writeNote: (args: WriteNoteArgs) => Promise<string>;
      renameNote: (args: RenameNoteArgs) => Promise<string>;
      deleteNote: (args: DeleteNoteArgs) => Promise<string>;
      showContextMenu: (options: { items: { label: string; id: string }[]; x?: number; y?: number }) => Promise<{ id: string | null }>;
      updateFrontmatter: (args: UpdateFrontmatterArgs) => Promise<string>;
      listBacklinks: (args: ListBacklinksArgs) => Promise<any>;
      chat: (messages: Message[]) => Promise<any>;
      streamChat: (
        messages: Message[],
        onChunk: (chunk: any) => void,
        onDone: () => void,
        onError: (error: string) => void
      ) => () => void;
      startIndexer: () => Promise<{ success: boolean }>;
      stopIndexer: () => Promise<{ success: boolean }>;
      reindexAll: () => Promise<{ success: boolean }>;
      onIndexerProgress: (callback: (progress: IndexProgress) => void) => () => void;
      getVaultPath: () => Promise<string>;
      setVaultPath: (path: string) => Promise<{ success: boolean }>;
    };
  }
}
