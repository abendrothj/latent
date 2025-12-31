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

    const listener = (e: any) => {
      const label = e.detail?.label as string | undefined;
      if (!label) return;

      // Find document by title or path
      const doc = documents.find((d) => d.title === label || d.path === label);
      if (!doc) return;

      const doDelete = async () => {
        try {
          await window.electron.deleteNote({ path: doc.path });
          await loadDocuments();

          // If it was the active document, clear selection
          if (activeDocument === doc.path) {
            setActiveDocument(null);
            onSelectNote?.(null);
          }

          // Announce deletion
          window.dispatchEvent(new CustomEvent('announce', { detail: `Deleted ${doc.title || doc.path}` }));
        } catch (err) {
          console.error('Failed to delete note:', err);
          window.dispatchEvent(new CustomEvent('announce', { detail: `Failed to delete ${doc.title || doc.path}` }));
        }
      };

      if (confirm(`Confirm delete "${label}"?`)) {
        doDelete();
      }
    };

    window.addEventListener('sidebar:delete', listener);
    return () => window.removeEventListener('sidebar:delete', listener);
  }, [documents, activeDocument]);

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
      const fileName = `untitled-${Date.now()}.md`;
      await window.electron.writeNote({
        path: fileName,
        content: '# Untitled\n\n',
      });
      await loadDocuments();

      // Open the newly created note and notify parent
      setActiveDocument(fileName);
      onSelectNote?.(fileName);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  };

  const handleSelectNote = (path: string) => {
    setActiveDocument(path);
    onSelectNote?.(path);
  };

  const handleContextOpen = async (e: React.MouseEvent | { clientX: number; clientY: number; preventDefault?: () => void }, doc: Document) => {
    e.preventDefault?.();

    const { id } = await window.electron.showContextMenu({
      items: [
        { label: 'Rename', id: 'rename' },
        { label: 'Delete', id: 'delete' },
        { label: 'More…', id: 'more' },
      ],
      x: (e as any).clientX,
      y: (e as any).clientY,
    });

    if (!id) return;

    if (id === 'rename') {
      // select and trigger rename
      setActiveDocument(doc.path);
      onSelectNote?.(doc.path);
      window.dispatchEvent(new CustomEvent('sidebar:rename', { detail: { path: doc.path } }));
    } else if (id === 'delete') {
      if (confirm(`Delete "${doc.title || doc.path}"? This action cannot be undone.`)) {
        try {
          await window.electron.deleteNote({ path: doc.path });
          await loadDocuments();
          if (activeDocument === doc.path) {
            setActiveDocument(null);
            onSelectNote?.(null);
          }
          window.dispatchEvent(new CustomEvent('announce', { detail: `Deleted ${doc.title || doc.path}` }));
        } catch (err) {
          console.error('Failed to delete note:', err);
          window.dispatchEvent(new CustomEvent('announce', { detail: `Failed to delete ${doc.title || doc.path}` }));
        }
      }
    } else if (id === 'more') {
      alert('More actions coming soon');
    }
  };

  React.useEffect(() => {
    loadDocuments();
  }, []);

  return (
    <div className="h-full flex flex-col" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
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
      <div className="flex-1 overflow-auto p-2 relative">
        <div className="space-y-0.5">
          {documents.length === 0 ? (
            <div className="text-text-tertiary text-sm text-center py-4">
              No documents yet
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} tabIndex={0} onContextMenu={(e) => { e.preventDefault(); handleContextOpen(e, doc); }} onKeyDown={(e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const rect = (e.target as HTMLElement).getBoundingClientRect(); handleContextOpen({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, preventDefault: () => {} } as any, doc); } }}>
                <SidebarItem
                  icon={<FileText />}
                  label={doc.title || doc.path}
                  active={activeDocument === doc.path}
                  onClick={() => handleSelectNote(doc.path)}
                />
              </div>
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
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Allow Space/Enter to activate selection for accessibility
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <button
      onClick={onClick}
      onKeyDown={onKeyDown}
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
