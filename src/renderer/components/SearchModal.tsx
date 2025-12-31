import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, FileText } from 'lucide-react';
import type { SearchResult } from '../../shared/types';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectNote: (path: string) => void;
}

export function SearchModal({ isOpen, onClose, onSelectNote }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const searchDebounced = setTimeout(async () => {
      setIsSearching(true);
      try {
        const searchResults = await window.electron.searchNotes({
          query: query.trim(),
          limit: 10,
        });
        setResults(searchResults);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchDebounced);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results.length > 0) {
      e.preventDefault();
      handleSelectResult(results[selectedIndex]);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    onSelectNote(result.path);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-[20vh]"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          transition={{ duration: 0.15 }}
          className="bg-surface border border-border rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-5 h-5 text-text-tertiary" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search notes..."
              className="flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary text-sm focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="p-1 hover:bg-surface-hover rounded transition-colors"
              >
                <X className="w-4 h-4 text-text-tertiary" />
              </button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-auto">
            {isSearching ? (
              <div className="py-8 text-center text-text-tertiary text-sm">
                Searching...
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-text-tertiary text-sm">
                {query ? 'No results found' : 'Start typing to search...'}
              </div>
            ) : (
              <div className="py-2">
                {results.map((result, index) => (
                  <button
                    key={`${result.path}-${index}`}
                    onClick={() => handleSelectResult(result)}
                    className={`
                      w-full text-left px-4 py-3 transition-colors
                      ${
                        selectedIndex === index
                          ? 'bg-surface-hover border-l-2 border-accent'
                          : 'hover:bg-surface-hover'
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary mb-1">
                          {result.title || result.path}
                        </div>
                        <div className="text-xs text-text-secondary line-clamp-2">
                          {result.chunk}
                        </div>
                        {result.score !== undefined && (
                          <div className="text-xs text-text-tertiary mt-1">
                            Relevance: {(result.score * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border bg-background flex items-center justify-between text-xs text-text-tertiary">
            <div className="flex gap-4">
              <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded">↑</kbd> <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded">↓</kbd> to navigate</span>
              <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded">Enter</kbd> to select</span>
            </div>
            <span><kbd className="px-1.5 py-0.5 bg-surface border border-border rounded">Esc</kbd> to close</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
