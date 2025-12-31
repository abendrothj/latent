import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { FileText, Search, Settings, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { SearchModal } from '../SearchModal';
import type { Document } from '../../../shared/types';

interface SidebarProps {
  onSelectNote?: (path: string) => void;
}

export interface SidebarHandle {
  openSearch: () => void;
}

export const Sidebar = forwardRef<SidebarHandle, SidebarProps>(({ onSelectNote }, ref) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openSearch: () => setIsSearchOpen(true),
  }));

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const docs = await window.electron.listDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const handleNewNote = async () => {
    try {
      const fileName = `note-${Date.now()}.md`;
      await window.electron.writeNote({
        path: fileName,
        content: '# New Note\n\n',
      });
      await loadDocuments();
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleSelectNote = (path: string) => {
    setActiveDocument(path);
    onSelectNote?.(path);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Sidebar Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Vault
        </h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewNote}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* File Tree / List */}
      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-0.5">
          {documents.length === 0 ? (
            <div className="text-text-tertiary text-sm text-center py-4">
              No documents yet
            </div>
          ) : (
            documents.map((doc) => (
              <SidebarItem
                key={doc.id}
                icon={<FileText />}
                label={doc.title || doc.path}
                active={activeDocument === doc.path}
                onClick={() => handleSelectNote(doc.path)}
              />
            ))
          )}
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-border p-2">
        <div className="space-y-0.5">
          <SidebarItem icon={<Search />} label="Search" onClick={() => setIsSearchOpen(true)} />
          <SidebarItem icon={<Settings />} label="Settings" />
        </div>
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectNote={handleSelectNote}
      />
    </div>
  );
});

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function SidebarItem({ icon, label, active, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2 rounded-md
        text-sm transition-colors
        ${
          active
            ? 'bg-surface-hover text-text-primary border-l-2 border-accent'
            : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-hover'
        }
      `}
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      <span className="truncate text-left">{label}</span>
    </button>
  );
}
