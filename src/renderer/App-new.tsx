import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from './components/AppLayout';
import { Sidebar } from './components/Sidebar/Sidebar';
import { EditorPane } from './components/Editor/EditorPane';
import { AIPanel } from './components/Assistant/AIPanel';
import type { IndexProgress } from '../shared/types';

function App() {
  const [vaultPath, setVaultPath] = useState<string>('');
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [currentNote, setCurrentNote] = useState<string | null>(null);
  const sidebarRef = useRef<{ openSearch: () => void }>(null);

  useEffect(() => {
    // Load vault path
    window.electron.getVaultPath().then(setVaultPath);

    // Listen to indexer progress
    const unsubscribe = window.electron.onIndexerProgress(setIndexProgress);

    // Global keyboard shortcut for search (Cmd+K or Ctrl+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        sidebarRef.current?.openSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Status bar content
  const statusBar = (
    <div className="flex items-center justify-between w-full">
      <span className="text-text-tertiary">
        {indexProgress ? getStatusText(indexProgress) : 'Ready'}
      </span>
      <span className="text-text-tertiary">Vault: {vaultPath}</span>
    </div>
  );

  return (
    <AppLayout
      sidebar={<Sidebar ref={sidebarRef} onSelectNote={setCurrentNote} />}
      aiPanel={<AIPanel currentNote={currentNote} />}
      statusBar={statusBar}
    >
      <EditorPane currentNote={currentNote} onNoteChange={setCurrentNote} />
    </AppLayout>
  );
}

function getStatusText(progress: IndexProgress): string {
  switch (progress.phase) {
    case 'scanning':
      return 'Scanning vault...';
    case 'indexing':
      return progress.currentFile
        ? `Indexing ${progress.current}/${progress.total}: ${progress.currentFile}`
        : `Indexing ${progress.current}/${progress.total}...`;
    case 'complete':
      return `Indexed ${progress.total} file(s)`;
    case 'error':
      return `Error: ${progress.error}`;
    default:
      return 'Processing...';
  }
}

export default App;
