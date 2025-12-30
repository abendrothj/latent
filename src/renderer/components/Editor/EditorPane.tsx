import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { GripVertical, Save } from 'lucide-react';
import { Button } from '../ui/button';

interface EditorPaneProps {
  currentNote: string | null;
  onNoteChange: (path: string | null) => void;
}

export function EditorPane({ currentNote }: EditorPaneProps) {
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [aiSuggestion] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (currentNote) {
      loadNote(currentNote);
    } else {
      setContent('');
    }
  }, [currentNote]);

  const loadNote = async (path: string) => {
    try {
      const noteContent = await window.electron.readNote({ path });
      setContent(noteContent);
      setIsEditing(false);
    } catch (error: any) {
      console.error('Failed to load note:', error);
    }
  };

  const saveNote = async () => {
    if (!currentNote) return;

    try {
      await window.electron.writeNote({ path: currentNote, content });
      setIsEditing(false);
    } catch (error: any) {
      console.error('Failed to save note:', error);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsEditing(true);
  };

  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;

  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="h-12 flex items-center justify-between px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-primary">
            {currentNote || 'Untitled'}
          </span>
          {isEditing && (
            <span className="text-xs text-accent">Unsaved</span>
          )}
        </div>

        {isEditing && (
          <Button onClick={saveNote} size="sm" className="gap-2">
            <Save className="w-3.5 h-3.5" />
            Save
          </Button>
        )}
      </div>

      {/* Editor Content - Centered with max-width */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-[65ch] mx-auto px-6 py-16">
          {!currentNote ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h2 className="text-2xl font-semibold text-text-secondary mb-2">
                Welcome to Latent
              </h2>
              <p className="text-sm text-text-tertiary">
                Select a note from the sidebar or create a new one
              </p>
            </div>
          ) : (
            <div className="relative">
              {/* Block Handle (visible on hover) */}
              <div className="group relative">
                <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-4 h-4 text-text-tertiary cursor-grab hover:text-text-secondary" />
                </div>

                {/* Main Textarea */}
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={handleChange}
                  className="w-full min-h-[70vh] bg-transparent
                             font-serif text-base leading-relaxed
                             text-text-primary placeholder:text-text-tertiary
                             focus:outline-none resize-none
                             caret-accent"
                  placeholder="Start writing..."
                  spellCheck
                />

                {/* AI Autocomplete Ghost Text */}
                {aiSuggestion && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute pointer-events-none text-text-tertiary"
                  >
                    {aiSuggestion}
                  </motion.span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Editor Footer */}
      <div className="h-8 flex items-center justify-between px-6 border-t border-border text-xs text-text-secondary">
        <span>{wordCount} words</span>
        {isEditing && <span className="text-accent">●</span>}
      </div>
    </div>
  );
}
