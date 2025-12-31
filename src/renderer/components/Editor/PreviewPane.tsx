import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PreviewPaneProps {
  content: string;
}

export default function PreviewPane({ content }: PreviewPaneProps) {
  return (
    <div className="prose max-w-none px-6 py-6 text-text-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
