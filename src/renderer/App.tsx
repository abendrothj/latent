import React, { useState, useEffect } from 'react';
import Assistant from './components/Assistant';
import Editor from './components/Editor';
import StatusBar from './components/StatusBar';
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

  return (
    <div className="app">
      <div className="app-header">
        <h1>Latent</h1>
        <div className="vault-path">
          <span>Vault: {vaultPath}</span>
        </div>
      </div>

      <div className="app-main">
        <div className="editor-panel">
          <Editor currentNote={currentNote} onNoteChange={setCurrentNote} />
        </div>

        <div className="assistant-panel">
          <Assistant currentNote={currentNote} />
        </div>
      </div>

      <StatusBar progress={indexProgress} />
    </div>
  );
}

export default App;
