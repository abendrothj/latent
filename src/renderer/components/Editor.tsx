import React, { useState, useEffect } from 'react';

interface EditorProps {
  currentNote: string | null;
  onNoteChange: (path: string | null) => void;
}

function Editor({ currentNote, onNoteChange }: EditorProps) {
  const [content, setContent] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (currentNote) {
      loadNote(currentNote);
    } else {
      setContent('# Welcome to Latent\n\nStart typing or ask the assistant a question!');
    }
  }, [currentNote]);

  const loadNote = async (path: string) => {
    try {
      const noteContent = await window.electron.readNote({ path });
      setContent(noteContent);
      setIsEditing(false);
    } catch (error: any) {
      console.error('Failed to load note:', error);
      setContent(`Error loading note: ${error.message}`);
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

  return (
    <div className="editor">
      <div className="editor-header">
        <div className="editor-title">
          {currentNote || 'No note selected'}
        </div>
        {isEditing && (
          <button onClick={saveNote} className="btn-save">
            Save
          </button>
        )}
      </div>

      <div className="editor-content">
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="Start writing..."
          spellCheck={true}
        />
      </div>

      <div className="editor-footer">
        <span className="word-count">
          {content.split(/\s+/).filter(w => w.length > 0).length} words
        </span>
        {isEditing && <span className="unsaved-indicator">Unsaved changes</span>}
      </div>
    </div>
  );
}

export default Editor;
