import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import type { Message } from '../../../shared/types';

interface AIPanelProps {
  currentNote: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export function AIPanel({ currentNote }: AIPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);

    try {
      // Build message history for AI
      const aiMessages: Message[] = [
        {
          role: 'system',
          content: `You are an AI assistant for Latent, helping the user with their research notes.

Current context:
- User is ${currentNote ? `viewing: ${currentNote}` : 'not viewing any note'}

You have access to tools to read, search, and write notes. Be concise and cite sources.`,
        },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        {
          role: 'user' as const,
          content: input,
        },
      ];

      const response = await window.electron.chat(aiMessages);

      setIsThinking(false);

      // Simulate streaming effect (word-by-word)
      const words = response.message.content.split(' ');
      let currentText = '';

      for (let i = 0; i < words.length; i++) {
        currentText += (i > 0 ? ' ' : '') + words[i];
        setStreamingMessage(currentText);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message.content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingMessage('');
    } catch (error: any) {
      console.error('Chat error:', error);
      setIsThinking(false);

      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-12 flex items-center gap-2 px-4 border-b border-border">
        <Sparkles className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-medium">AI Assistant</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !streamingMessage && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Sparkles className="w-8 h-8 text-text-tertiary mb-4" />
            <p className="text-sm text-text-secondary mb-2">Ask me anything about your notes</p>
            <div className="text-xs text-text-tertiary space-y-1">
              <p>"What are my notes about quantum computing?"</p>
              <p>"Create a summary of my research"</p>
              <p>"Find notes related to AI"</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-1"
          >
            <div className="text-xs text-text-tertiary uppercase tracking-wide">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div
              className={`
                rounded-lg px-3 py-2 text-sm leading-relaxed
                ${
                  msg.role === 'user'
                    ? 'bg-accent text-white ml-8'
                    : 'bg-surface text-text-primary mr-8'
                }
              `}
            >
              {msg.content}
            </div>
          </motion.div>
        ))}

        {/* Streaming Message */}
        {streamingMessage && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-1"
          >
            <div className="text-xs text-text-tertiary uppercase tracking-wide">Assistant</div>
            <div className="bg-surface text-text-primary rounded-lg px-3 py-2 text-sm leading-relaxed mr-8">
              {streamingMessage.split(' ').map((word, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03, duration: 0.1 }}
                >
                  {word}{' '}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="relative border-t border-border p-4">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-surface rounded-lg px-4 py-3 pr-12
                       text-sm text-text-primary placeholder:text-text-tertiary
                       border border-border focus:border-accent
                       focus:outline-none focus:ring-1 focus:ring-accent
                       resize-none transition-colors"
            placeholder="Ask a question..."
            rows={3}
            disabled={isThinking}
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="absolute right-2 bottom-2 p-2 rounded-md
                       bg-accent hover:bg-accent-hover
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Thinking State - Animated Gradient */}
        <AnimatePresence>
          {isThinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden"
            >
              <div
                className="h-full bg-gradient-to-r from-transparent via-accent via-accent-secondary to-transparent
                           bg-[length:200%_100%] animate-gradient"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
