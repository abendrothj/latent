import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../../shared/types';

interface AssistantProps {
  currentNote: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

function Assistant({ currentNote }: AssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build message history for AI
      const aiMessages: Message[] = [
        {
          role: 'system',
          content: `You are an AI assistant helping the user manage their research notes. You have access to tools to read, search, and write notes.

Current context:
- User is ${currentNote ? `viewing: ${currentNote}` : 'not viewing any note'}

Guidelines:
- Always cite sources (note paths) when answering questions
- When searching, use multiple queries if needed to be thorough
- When creating notes, use clear Markdown formatting
- Ask for clarification if the user's request is ambiguous`,
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

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.message.content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('Chat error:', error);

      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `Error: ${error.message}`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="assistant">
      <div className="assistant-header">
        <h2>AI Assistant</h2>
      </div>

      <div className="assistant-messages">
        {messages.length === 0 && (
          <div className="assistant-welcome">
            <p>👋 Hi! I can help you:</p>
            <ul>
              <li>Search your notes</li>
              <li>Summarize content</li>
              <li>Create new notes</li>
              <li>Find connections</li>
            </ul>
            <p>Try asking: "What are my notes about quantum computing?"</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message message-${msg.role}`}>
            <div className="message-role">
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="message-content">{msg.content}</div>
            <div className="message-time">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message message-assistant">
            <div className="message-role">Assistant</div>
            <div className="message-content typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="assistant-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask a question..."
          disabled={isLoading}
          rows={3}
        />
        <button onClick={handleSend} disabled={isLoading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

export default Assistant;
