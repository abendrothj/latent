# Design Implementation Guide

Step-by-step guide to implementing the Latent design system.

## Phase 1: Install Dependencies

```bash
npm install \
  @radix-ui/react-slot \
  @radix-ui/react-separator \
  @radix-ui/react-tooltip \
  @radix-ui/react-scroll-area \
  class-variance-authority \
  clsx \
  tailwind-merge \
  framer-motion \
  lucide-react \
  react-resizable-panels
```

## Phase 2: Configure Tailwind

Update `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b',
        surface: '#18181b',
        'surface-hover': '#27272a',
        border: '#27272a',
        'border-hover': '#3f3f46',

        'text-primary': '#fafafa',
        'text-secondary': '#a1a1aa',
        'text-tertiary': '#52525b',

        accent: '#6366f1',
        'accent-hover': '#818cf8',
        'accent-secondary': '#14b8a6',

        danger: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Geist Sans', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'Merriweather', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Geist Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
      },
      lineHeight: {
        tight: '1.25',
        normal: '1.5',
        relaxed: '1.75',
      },
      spacing: {
        0: '0',
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem',
      },
      borderRadius: {
        sm: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
      },
      keyframes: {
        'caret-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        gradient: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'caret-pulse': 'caret-pulse 1s ease-in-out infinite',
        gradient: 'gradient 2s ease infinite',
        'fade-in': 'fade-in 0.15s ease-out',
      },
    },
  },
  plugins: [],
}
```

## Phase 3: Utility Functions

Create `src/renderer/lib/utils.ts`:

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Phase 4: Base Components

### Button Component

`src/renderer/components/ui/button.tsx`:

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-white hover:bg-accent-hover',
        ghost: 'hover:bg-surface-hover',
        outline: 'border border-border hover:bg-surface-hover',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

### Separator Component

`src/renderer/components/ui/separator.tsx`:

```tsx
import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cn } from '@/lib/utils';

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
      className
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
```

## Phase 5: Layout Components

### AppLayout Component

`src/renderer/components/AppLayout.tsx`:

```tsx
import React, { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { motion, AnimatePresence } from 'framer-motion';
import { Separator } from './ui/separator';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [focusMode, setFocusMode] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-background text-text-primary">
      {/* Header */}
      <header className="h-10 flex items-center justify-between px-4 border-b border-border">
        <h1 className="text-sm font-semibold">Latent</h1>
        <button
          onClick={() => setFocusMode(!focusMode)}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          Focus {focusMode ? 'Off' : 'On'}
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Left Sidebar */}
          <AnimatePresence>
            {!focusMode && (
              <motion.div
                initial={{ x: 0 }}
                exit={{ x: -240 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <Panel defaultSize={20} minSize={15} maxSize={30}>
                  <div className="h-full bg-surface">
                    {/* Sidebar content */}
                  </div>
                </Panel>

                <PanelResizeHandle className="w-px bg-border hover:bg-accent transition-colors" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center Pane */}
          <Panel defaultSize={50}>
            <div className="h-full overflow-auto">
              {children}
            </div>
          </Panel>

          {/* Right Sidebar (AI Panel) */}
          <AnimatePresence>
            {!focusMode && (
              <motion.div
                initial={{ x: 0 }}
                exit={{ x: 400 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <PanelResizeHandle className="w-px bg-border hover:bg-accent transition-colors" />

                <Panel defaultSize={30} minSize={25} maxSize={40}>
                  <div className="h-full bg-surface">
                    {/* AI Panel content */}
                  </div>
                </Panel>
              </motion.div>
            )}
          </AnimatePresence>
        </PanelGroup>
      </div>

      {/* Status Bar */}
      <footer className="h-6 flex items-center px-4 border-t border-border text-xs text-text-secondary">
        Ready
      </footer>
    </div>
  );
}
```

## Phase 6: Editor Component

### Notes: Title & Rename behavior
- New notes are created with a visible default title of **Untitled** (content: `# Untitled\n\n`). The underlying filename will be `untitled-<timestamp>.md` to avoid collisions.
- The editor header shows an editable title (click pencil to edit). Saving the title will rename the underlying file (attempts a filesystem rename and updates DB links). Errors show an inline message.


`src/renderer/components/Editor.tsx`:

```tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GripVertical } from 'lucide-react';

export function Editor() {
  const [content, setContent] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');

  return (
    <div className="max-w-[65ch] mx-auto px-6 py-16">
      <div className="relative group">
        {/* Block handle (visible on hover) */}
        <div className="absolute -left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical className="w-4 h-4 text-text-tertiary cursor-grab" />
        </div>

        {/* Editor */}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[60vh] bg-transparent
                     font-serif text-base leading-relaxed
                     text-text-primary placeholder:text-text-tertiary
                     focus:outline-none resize-none
                     caret-accent animate-caret-pulse"
          placeholder="Start writing..."
        />

        {/* AI autocomplete ghost text */}
        {aiSuggestion && (
          <span className="absolute text-text-tertiary pointer-events-none">
            {aiSuggestion}
          </span>
        )}
      </div>
    </div>
  );
}
```

## Phase 7: AI Panel Component

`src/renderer/components/AIPanel.tsx`:

```tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

export function AIPanel() {
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);

  const handleSend = () => {
    if (!input.trim()) return;

    setMessages([...messages, { role: 'user', content: input }]);
    setInput('');
    setIsThinking(true);

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'This is a simulated AI response.' },
      ]);
      setIsThinking(false);
    }, 1000);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-border">
        <h2 className="text-sm font-medium">AI Assistant</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className={`
              ${msg.role === 'user' ? 'ml-auto bg-accent' : 'mr-auto bg-surface'}
              max-w-[80%] rounded-lg px-4 py-2
            `}
          >
            {msg.content}
          </motion.div>
        ))}
      </div>

      {/* Input */}
      <div className="relative border-t border-border p-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="w-full bg-surface rounded-lg px-4 py-3 pr-12
                     text-sm text-text-primary placeholder:text-text-tertiary
                     focus:outline-none focus:ring-2 focus:ring-accent
                     resize-none"
          placeholder="Ask a question..."
          rows={3}
        />

        <button
          onClick={handleSend}
          className="absolute right-6 bottom-6 p-2 rounded-md
                     bg-accent hover:bg-accent-hover
                     transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>

        {/* Thinking state */}
        {isThinking && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-transparent via-accent to-transparent
                         animate-gradient bg-[length:200%_100%]"
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

## Phase 8: Global Styles

Update `src/renderer/styles/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-text-primary;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }

  /* Custom scrollbar */
  ::-webkit-scrollbar {
    @apply w-1.5 h-1.5;
  }

  ::-webkit-scrollbar-track {
    @apply bg-transparent;
  }

  ::-webkit-scrollbar-thumb {
    @apply bg-border rounded-sm;
  }

  ::-webkit-scrollbar-thumb:hover {
    @apply bg-border-hover;
  }
}

@layer components {
  /* Prose styles for editor */
  .prose {
    @apply text-text-primary;
  }

  .prose h1 {
    @apply text-2xl font-semibold mt-8 mb-4;
  }

  .prose h2 {
    @apply text-xl font-semibold mt-6 mb-3;
  }

  .prose h3 {
    @apply text-lg font-medium mt-4 mb-2;
  }

  .prose p {
    @apply mb-4;
  }

  .prose a {
    @apply text-accent-secondary underline hover:text-accent;
  }

  .prose code {
    @apply bg-surface px-1.5 py-0.5 rounded font-mono text-sm;
  }

  .prose pre {
    @apply bg-surface p-4 rounded-lg overflow-x-auto my-4;
  }

  .prose blockquote {
    @apply border-l-2 border-accent pl-4 italic text-text-secondary;
  }
}
```

## Phase 9: Font Loading

Add to `src/renderer/index.html`:

```html
<head>
  <!-- ... -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
```

Or install locally:

```bash
npm install @fontsource/inter @fontsource/newsreader @fontsource/jetbrains-mono
```

Then import in `main.tsx`:

```ts
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/jetbrains-mono/400.css';
```

## Phase 10: Test the UI

```bash
npm run dev
```

You should now see the "Academic Brutalism" aesthetic in action!

---

## Next Steps

1. Wire up real data (notes, AI responses)
2. Add keyboard shortcuts
3. Implement graph view
4. Add command palette (Cmd+K)
5. Accessibility audit

See [component-library.md](component-library.md) for full component reference.
