import React from 'react';
import type { IndexProgress } from '../../shared/types';

interface StatusBarProps {
  progress: IndexProgress | null;
}

function StatusBar({ progress }: StatusBarProps) {
  if (!progress) {
    return (
      <div className="status-bar">
        <span className="status-text">Ready</span>
      </div>
    );
  }

  const getStatusText = () => {
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
  };

  const getProgressPercent = () => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  return (
    <div className="status-bar">
      <span className="status-text">{getStatusText()}</span>

      {progress.phase === 'indexing' && (
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${getProgressPercent()}%` }}
          />
        </div>
      )}

      {progress.phase === 'indexing' && (
        <span className="progress-percent">{getProgressPercent()}%</span>
      )}
    </div>
  );
}

export default StatusBar;
