import React, { useState, useEffect } from 'react';
import NoteTitleEditable from './Editor/NoteTitleEditable';
import PreviewPane from './Editor/PreviewPane';
import { Eye, Columns } from 'lucide-react';

interface EditorProps {
  currentNote: string | null;
  onNoteChange: (path: string | null) => void;
}

function Editor({ currentNote, onNoteChange }: EditorProps) {
  const [content, setContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState<string>('Untitled');

  useEffect(() => {
    if (currentNote) {
      loadNote(currentNote);
    } else {
      setContent('# Welcome to Latent\n\nStart typing or ask the assistant a question!');
    }
  }, [currentNote]);

  const extractTitle = (text: string, path?: string) => {
    // Prefer first H1 (`# Title`) as quick heuristic
    const match = text.match(/^#\s+(.*)/m);
    if (match) return match[1].trim();

    if (path) {
      const parts = path.split('/');
      let name = parts[parts.length - 1] || path;
      name = name.replace(/\.md$/, '');
      return name || 'Untitled';
    }

    return 'Untitled';
  };

  const loadNote = async (path: string) => {
    try {
      const noteContent = await window.electron.readNote({ path });
      setContent(noteContent);
      setIsEditing(false);
      setTitle(extractTitle(noteContent, path));
    } catch (error: any) {
      console.error('Failed to load note:', error);
      setContent(`Error loading note: ${error.message}`);
      setTitle('Untitled');
    }
  };

  const saveNote = async () => {
    if (!currentNote) return;

    try {
      await window.electron.writeNote({ path: currentNote, content });
      setIsEditing(false);
      console.log('Note saved successfully');
    } catch (error: any) {
      console.error('Failed to save note:', error);
      alert(`Failed to save note: ${error.message}`);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsEditing(true);
  };

  // Preview state: default is write-only (preview hidden)
  const [showPreview, setShowPreview] = useState<boolean>(false);

  // Splitter ratio (0-1), default 50/50
  const [splitRatio, setSplitRatio] = useState<number>(0.5);

  // Auto-edit title for freshly created Untitled notes
  const [autoEditTitle, setAutoEditTitle] = useState<boolean>(false);

  // Keyboard shortcut: Cmd/Ctrl + Shift + P toggles preview
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowPreview((s) => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // When a new note is loaded which looks like an Untitled template, auto-edit the title
  React.useEffect(() => {
    if (currentNote && content.trim().startsWith('# Untitled')) {
      setAutoEditTitle(true);
    } else {
      setAutoEditTitle(false);
    }
  }, [currentNote, content]);

  // Listen for rename command from sidebar context menu and trigger auto-edit.
  React.useEffect(() => {
    const handler = (e: any) => {
      const path = e.detail?.path as string | undefined;
      if (!path) return;

      if (path !== currentNote) {
        // Ensure the note is selected/opened
        onNoteChange(path);
        // Give the editor a moment to load the content, then trigger edit
        setTimeout(() => setAutoEditTitle(true), 120);
      } else {
        setAutoEditTitle(true);
      }
    };

    window.addEventListener('sidebar:rename', handler);
    return () => window.removeEventListener('sidebar:rename', handler);
  }, [currentNote, onNoteChange]);

  // Splitter drag handlers
  const minRatio = 0.25;
  const maxRatio = 0.75;
  const resizerRef = React.useRef<HTMLDivElement | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const startX = e.clientX;
    const container = resizerRef.current?.parentElement as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startRatio = splitRatio;

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const newRatio = Math.min(maxRatio, Math.max(minRatio, (startRatio * rect.width + dx) / rect.width));
      setSplitRatio(newRatio);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    (e.target as Element).setPointerCapture((e as any).pointerId);
  };

  const onResizerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      setSplitRatio((r) => Math.max(minRatio, r - 0.05));
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      setSplitRatio((r) => Math.min(maxRatio, r + 0.05));
      e.preventDefault();
    }
  };

  return (
    <div className="editor h-full flex flex-col">
      <div className="editor-header flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {currentNote ? (
            <NoteTitleEditable
              path={currentNote}
              title={title}
              autoEdit={autoEditTitle}
              onRenamed={(newPath) => {
                // notify parent of the new path and reload
                onNoteChange(newPath);
                loadNote(newPath);
                window.dispatchEvent(new CustomEvent('announce', { detail: `Renamed note` }));
              }}
            />
          ) : (
            <div className="text-sm text-text-tertiary">No note selected</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            aria-pressed={showPreview}
            title="Toggle preview (Shift+Cmd/Ctrl+P)"
            className="text-text-tertiary hover:text-text-secondary"
            onClick={() => setShowPreview((s) => !s)}
          >
            <Eye className="w-4 h-4" />
          </button>

          {isEditing && (
            <button onClick={saveNote} className="btn-save">
              Save
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Split view when preview is active */}
        {showPreview ? (
          <div className="flex h-full relative" role="region" aria-label="Editor split view">
            <div className="overflow-auto" style={{ width: `${splitRatio * 100}%` }}>
              <div className="max-w-[65ch] mx-auto px-6 py-16">
                <textarea
                  className="w-full min-h-[70vh] bg-transparent font-serif text-base leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none resize-none caret-accent"
                  value={content}
                  onChange={handleChange}
                  placeholder="Start writing..."
                  spellCheck
                />
              </div>
            </div>

            <div
              ref={resizerRef}
              role="separator"
              tabIndex={0}
              aria-orientation="vertical"
              aria-valuemin={minRatio * 100}
              aria-valuemax={maxRatio * 100}
              aria-valuenow={Math.round(splitRatio * 100)}
              onPointerDown={onPointerDown}
              onKeyDown={onResizerKey}
              className="w-2 cursor-col-resize bg-border hover:bg-accent focus:outline-none focus:ring-2 focus:ring-accent"
              title="Resize panes"
            />

            <div className="overflow-auto bg-surface" style={{ flex: 1 }}>
              <PreviewPane content={content} />
            </div>
          </div>
        ) : (
          <div className="max-w-[65ch] mx-auto px-6 py-16">
            <textarea
              value={content}
              onChange={handleChange}
              placeholder="Start writing..."
              spellCheck={true}
              className="w-full min-h-[70vh] bg-transparent font-serif text-base leading-relaxed text-text-primary placeholder:text-text-tertiary focus:outline-none resize-none caret-accent"
            />
          </div>
        )}
      </div>

      <div className="editor-footer h-8 flex items-center justify-between px-6 border-t border-border text-xs text-text-secondary">
        <span>{content.split(/\s+/).filter(w => w.length > 0).length} words</span>
        {isEditing && <span className="text-accent">●</span>}
      </div>
    </div>
  );
}

export default Editor;
