import React, { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { motion, AnimatePresence } from 'framer-motion';
import { Separator } from './ui/separator';

interface AppLayoutProps {
  sidebar?: React.ReactNode;
  children: React.ReactNode;
  aiPanel?: React.ReactNode;
  statusBar?: React.ReactNode;
}

export function AppLayout({ sidebar, children, aiPanel, statusBar }: AppLayoutProps) {
  const [focusMode, setFocusMode] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-background text-text-primary font-sans">
      {/* Header */}
      <header className="h-10 flex items-center justify-between px-4 border-b border-border">
        <h1 className="text-sm font-semibold tracking-tight">Latent</h1>
        <button
          onClick={() => setFocusMode(!focusMode)}
          className="text-xs text-text-secondary hover:text-text-primary transition-colors px-2 py-1 rounded hover:bg-surface-hover"
        >
          {focusMode ? 'Exit Focus' : 'Focus Mode'}
        </button>
      </header>

      {/* Main Content - 3 Pane Layout */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Sidebar */}
          <AnimatePresence>
            {!focusMode && sidebar && (
              <>
                <Panel defaultSize={20} minSize={15} maxSize={30} id="sidebar">
                  <motion.div
                    initial={false}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="h-full bg-surface"
                  >
                    {sidebar}
                  </motion.div>
                </Panel>

                <PanelResizeHandle className="w-px bg-border hover:bg-accent transition-colors data-[resize-handle-active]:bg-accent" />
              </>
            )}
          </AnimatePresence>

          {/* Center Pane (The Stage) */}
          <Panel defaultSize={focusMode ? 100 : 50} id="main">
            <div className="h-full overflow-auto">
              {children}
            </div>
          </Panel>

          {/* Right Sidebar (AI Panel) */}
          <AnimatePresence>
            {!focusMode && aiPanel && (
              <>
                <PanelResizeHandle className="w-px bg-border hover:bg-accent transition-colors data-[resize-handle-active]:bg-accent" />

                <Panel defaultSize={30} minSize={25} maxSize={40} id="ai-panel">
                  <motion.div
                    initial={false}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="h-full bg-surface"
                  >
                    {aiPanel}
                  </motion.div>
                </Panel>
              </>
            )}
          </AnimatePresence>
        </PanelGroup>
      </div>

      {/* Status Bar */}
      {statusBar && (
        <>
          <Separator />
          <footer className="h-6 flex items-center px-4 bg-surface text-xs text-text-secondary">
            {statusBar}
          </footer>
        </>
      )}
    </div>
  );
}
