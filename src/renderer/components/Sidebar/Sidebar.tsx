import React from 'react';
import { FileText, Search, Settings, Plus } from 'lucide-react';
import { Button } from '../ui/button';

export function Sidebar() {
  return (
    <div className="h-full flex flex-col">
      {/* Sidebar Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-border">
        <h2 className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Vault
        </h2>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* File Tree / List */}
      <div className="flex-1 overflow-auto p-2">
        <div className="space-y-0.5">
          {/* Example items */}
          <SidebarItem icon={<FileText />} label="welcome.md" active />
          <SidebarItem icon={<FileText />} label="quantum-computing.md" />
          <SidebarItem icon={<FileText />} label="ai-assistant.md" />
        </div>
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-border p-2">
        <div className="space-y-0.5">
          <SidebarItem icon={<Search />} label="Search" />
          <SidebarItem icon={<Settings />} label="Settings" />
        </div>
      </div>
    </div>
  );
}

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

function SidebarItem({ icon, label, active }: SidebarItemProps) {
  return (
    <button
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
