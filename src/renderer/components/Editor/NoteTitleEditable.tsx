import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';














































});  expect(Number(after)).not.toBe(Number(before));  const after = separator.getAttribute('aria-valuenow');  await user.keyboard('{ArrowRight}');  const before = separator.getAttribute('aria-valuenow');  // Press ArrowRight to increase right pane, i.e., decrease left fraction  separator.focus();  const separator = screen.getByRole('separator');  await user.click(toggle);  const toggle = screen.getByTitle(/toggle preview/i);  // Show preview  render(<Editor currentNote={'test.md'} onNoteChange={() => {}} />);  const user = userEvent.setup();test('resizer keyboard arrows adjust split', async () => {});  expect(screen.queryByText('Content')).not.toBeInTheDocument();  await user.keyboard('{Control}{Shift}p');  // Toggle via keyboard shortcut (Shift+Meta+P). Simulate Ctrl for Node env  expect(await screen.findByText('Content')).toBeInTheDocument();  await user.click(toggle);  const toggle = screen.getByTitle(/toggle preview/i);  // Toggle preview via button  expect(screen.queryByText('Content')).not.toBeInTheDocument();  // By default preview should be hidden  render(<Editor currentNote={'test.md'} onNoteChange={() => {}} />);  const user = userEvent.setup();test('default is write-only and toggles preview with button and keyboard', async () => {});  };    writeNote: jest.fn().mockResolvedValue('Saved'),    readNote: jest.fn().mockResolvedValue('# Hello\n\nContent'),  (window as any).electron = {beforeEach(() => {// Mock electron API used by Editorimport Editor from '../../src/renderer/components/Editor';import userEvent from '@testing-library/user-event';
interface NoteTitleEditableProps {
  path: string; // current path like 'notes/foo.md'
  title: string; // derived title (e.g., first H1 or filename)
  onRenamed?: (newPath: string) => void;
  autoEdit?: boolean; // if true, begin editing immediately
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'untitled';
}

export default function NoteTitleEditable({ path, title, onRenamed, autoEdit = false }: NoteTitleEditableProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title || 'Untitled');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setValue(title || 'Untitled');
  }, [title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Start editing if autoEdit is requested
  useEffect(() => {
    if (autoEdit) {
      setEditing(true);
    }
  }, [autoEdit]);

  const cancel = () => {
    setValue(title || 'Untitled');
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    const newTitle = value.trim() || 'Untitled';
    if (newTitle === (title || 'Untitled')) {
      setEditing(false);
      return;
    }

    // compute new path in same directory
    const parts = path.split('/');
    const fileName = `${slugify(newTitle)}.md`;
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';
    const newPath = `${dir}${fileName}`;

    setIsSaving(true);
    setError(null);

    try {
      await window.electron.renameNote({ oldPath: path, newPath });
      setIsSaving(false);
      setEditing(false);
      onRenamed?.(newPath);
      // Announce to screen readers
      window.dispatchEvent(new CustomEvent('announce', { detail: `Renamed to ${newTitle}` }));
    } catch (err: any) {
      setIsSaving(false);
      setError(err?.message || String(err));
      console.error('Failed to rename note:', err);
      window.dispatchEvent(new CustomEvent('announce', { detail: `Failed to rename note: ${err?.message || 'unknown error'}` }));
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      cancel();
    }
  };

  return (
    <div className="flex items-center gap-3">
      {!editing ? (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary truncate">{value}</span>
          <button
            aria-label="Rename note"
            title="Rename note"
            className="text-text-tertiary hover:text-text-secondary"
            onClick={() => setEditing(true)}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKey}
            onBlur={save}
            className="bg-transparent border border-border rounded px-2 py-1 text-sm w-60"
            aria-label="Edit note title"
          />
          {isSaving ? (
            <span className="text-xs text-text-tertiary">Saving…</span>
          ) : (
            <>
              <button onClick={save} title="Save" className="text-accent">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={cancel} title="Cancel" className="text-text-tertiary">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}
