import React, { useState, useEffect } from 'react';
import { AppLayout } from './components/AppLayout';
import { Sidebar } from './components/Sidebar/Sidebar';
import { EditorPane } from './components/Editor/EditorPane';
import { AIPanel } from './components/Assistant/AIPanel';
import type { IndexProgress } from '../shared/types';

function App() {
  const [vaultPath, setVaultPath] = useState<string>('');
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null);
  const [currentNote, setCurrentNote] = useState<string | null>(null);

  useEffect(() => {
    // Load vault path
    window.electron.getVaultPath().then(setVaultPath);

    // Listen to indexer progress
    const unsubscribe = window.electron.onIndexerProgress(setIndexProgress);

    return unsubscribe;
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
      sidebar={<Sidebar />}
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
