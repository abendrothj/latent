# Latent Design System

**Design Philosophy**: "Academic Brutalism meets Silicon Valley SaaS"

The aesthetic philosophy can be summarized as **"Quiet Intelligence"** — a design that recedes to let content shine, using typography and whitespace instead of heavy chrome.

## Design Influences

- **Linear**: Clean, purposeful, no cruft
- **iA Writer**: Focus mode, typography-first
- **Obsidian**: Information density without chaos
- **Arc Browser**: Spatial design, hidden UI until needed

## Core Principles

### 1. Content First (90% Rule)

90% of pixels should be content (notes, graph, data). Chrome and UI furniture should be minimal.

**Implementation**:
- No heavy headers or footers
- Sidebar collapses to icon strip
- Focus mode hides everything except active note

### 2. Motion as Feedback

Since everything is local, interactions are instant (0ms latency). Use animation only to **communicate state changes**, not to "feel premium."

**Rules**:
- Page transitions: 0ms (instant)
- Panel slide-in/out: 150ms ease-out
- AI "thinking": Subtle gradient pulse
- Hover states: 0ms (instant)

### 3. Typography IS the UI

We don't use borders, shadows, or colors to separate elements. We use:
- **Font weight** (400 for body, 500 for labels, 600 for headings)
- **Whitespace** (generous padding, rhythm)
- **Type hierarchy** (size + weight combinations)

---

## Visual Foundation

### Color Palette

#### Dark Mode (Default)

```css
--background: #09090b;        /* True black */
--surface: #18181b;           /* Elevated surfaces */
--surface-hover: #27272a;     /* Hover states */
--border: #27272a;            /* Subtle borders */
--border-hover: #3f3f46;      /* Active borders */

--text-primary: #fafafa;      /* Main text */
--text-secondary: #a1a1aa;    /* Labels, metadata */
--text-tertiary: #52525b;     /* Placeholder, disabled */

--accent: #6366f1;            /* Indigo - AI actions */
--accent-hover: #818cf8;      /* Indigo lighter */
--accent-secondary: #14b8a6;  /* Teal - Links, success */

--danger: #ef4444;            /* Destructive actions */
--warning: #f59e0b;           /* Warnings */
```

**Color Usage Rules**:
- Background: Always `--background`
- Borders: Use `--border` (1px solid)
- Accent: **Sparingly** — only for active state or AI
- Never use more than 2 accent colors on screen at once

#### Light Mode (Optional)

```css
--background: #ffffff;        /* Paper white */
--surface: #fafafa;
--surface-hover: #f4f4f5;
--border: #e4e4e7;
--border-hover: #d4d4d8;

--text-primary: #09090b;
--text-secondary: #52525b;
--text-tertiary: #a1a1aa;

/* Accents remain the same */
```

### Typography

#### Font Families

```css
/* UI Elements (Buttons, Labels, Sidebar) */
--font-ui: 'Geist Sans', 'Inter', -apple-system, sans-serif;

/* Editor Body Text (Long-form reading) */
--font-editor: 'Newsreader', 'Merriweather', 'Georgia', serif;

/* Code, Data, Monospace */
--font-mono: 'JetBrains Mono', 'Geist Mono', 'Menlo', monospace;
```

#### Type Scale

```css
--text-xs: 0.75rem;    /* 12px - Metadata, timestamps */
--text-sm: 0.875rem;   /* 14px - UI labels */
--text-base: 1rem;     /* 16px - Body text */
--text-lg: 1.125rem;   /* 18px - Subheadings */
--text-xl: 1.25rem;    /* 20px - Headings */
--text-2xl: 1.5rem;    /* 24px - Page titles */
--text-3xl: 1.875rem;  /* 30px - Hero */
```

#### Line Heights

```css
--leading-tight: 1.25;   /* Headings */
--leading-normal: 1.5;   /* UI text */
--leading-relaxed: 1.75; /* Editor body (readability) */
```

#### Font Weights

```css
--font-normal: 400;   /* Body text */
--font-medium: 500;   /* Labels, UI emphasis */
--font-semibold: 600; /* Headings */
--font-bold: 700;     /* Rare, only for extreme emphasis */
```

### Spacing System

Geometric scale based on 4px:

```css
--space-0: 0;
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-5: 1.25rem;  /* 20px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */
--space-10: 2.5rem;  /* 40px */
--space-12: 3rem;    /* 48px */
--space-16: 4rem;    /* 64px */
```

**Usage**:
- Tight spacing: `--space-2` (8px) for inline elements
- Normal spacing: `--space-4` (16px) for component padding
- Generous spacing: `--space-8` (32px) between sections

### Border Radius

```css
--radius-sm: 0.25rem;  /* 4px - Buttons, inputs */
--radius-md: 0.375rem; /* 6px - Cards */
--radius-lg: 0.5rem;   /* 8px - Panels */
--radius-xl: 0.75rem;  /* 12px - Modals */
```

**Rule**: Use subtle radius (4-6px) for clickable elements. Avoid pill shapes.

### Shadows

Minimal. Only use for elevation when necessary:

```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
```

**Rule**: Avoid shadows in dark mode. Use borders instead.

---

## Layout Architecture

### The "Holy Grail" 3-Pane Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header (40px)                                  [Focus] │
├──────┬──────────────────────────────────┬───────────────┤
│      │                                  │               │
│ Left │         Center Pane              │  Right Pane   │
│ Pane │       (The Stage)                │  (AI Agent)   │
│      │                                  │               │
│ 240px│         Fluid (Flex 1)           │    400px      │
│      │                                  │               │
│      │  ┌────────────────────────────┐ │               │
│      │  │  Editor (max-width: 65ch)  │ │               │
│      │  │                            │ │               │
│      │  │  Content centered,         │ │               │
│      │  │  surrounded by whitespace  │ │               │
│      │  └────────────────────────────┘ │               │
│      │                                  │               │
├──────┴──────────────────────────────────┴───────────────┤
│  Status Bar (24px)                                      │
└─────────────────────────────────────────────────────────┘
```

#### Left Pane: The Vault

**Width**: 200px - 320px (resizable)
**Content**:
- File tree (collapsible folders)
- Favorites (pinned notes)
- Tags (browseable)
- Inbox (quick capture)

**Aesthetic**:
- Ghostly: Text is `--text-tertiary` until hovered
- No background on items
- Hover state: `--surface-hover` background
- Active item: Subtle `--accent` left border (2px)

#### Center Pane: The Stage

**Width**: Flex 1 (takes remaining space)
**Content**: Active note, graph view, or settings
**Key Feature**: Focus Mode (Cmd+K) collapses both sidebars

**Editor Constraints**:
```css
.editor-container {
  max-width: 65ch; /* ~650px at 16px font */
  margin: 0 auto;
  padding: var(--space-16) var(--space-6);
}
```

Why 65ch? Optimal line length for reading comprehension.

#### Right Pane: The Latent Agent

**Width**: 350px - 500px (resizable)
**Content**:
- Chat history (scrollable)
- "Thought process" logs (collapsible)
- Suggested links (contextual)
- Input field (fixed bottom)

**Behavior**: Persistent. Always visible unless in Focus Mode.

### Resizable Panels

Use `react-resizable-panels`:

```tsx
<PanelGroup direction="horizontal">
  <Panel defaultSize={20} minSize={15} maxSize={30}>
    <Sidebar />
  </Panel>

  <PanelResizeHandle className="w-px bg-border hover:bg-border-hover" />

  <Panel defaultSize={50}>
    <Editor />
  </Panel>

  <PanelResizeHandle className="w-px bg-border hover:bg-border-hover" />

  <Panel defaultSize={30} minSize={25} maxSize={40}>
    <AIPanel />
  </Panel>
</PanelGroup>
```

---

## Component Specifications

### 1. The "Living" Editor

The editor should feel alive, not static.

**Features**:
- **Pulsing Caret**: Subtle pulse animation (opacity 0.7 → 1.0)
- **AI Autocomplete**: Grey "ghost text" ahead of cursor (accept with Tab)
- **Block Handles**: Hover left margin shows `⋮⋮` for drag-to-reorder

**Implementation**:

```tsx
<div className="editor">
  {/* Block handle (visible on hover) */}
  <div className="block-handle">
    <GripVertical className="w-4 h-4 text-text-tertiary" />
  </div>

  {/* Editable content */}
  <div
    contentEditable
    className="prose prose-invert max-w-none
               font-editor leading-relaxed
               focus:outline-none"
  >
    {content}
  </div>

  {/* AI ghost text */}
  {aiSuggestion && (
    <span className="absolute text-text-tertiary pointer-events-none">
      {aiSuggestion}
    </span>
  )}
</div>
```

**Caret Animation**:

```css
@keyframes caret-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.editor:focus::after {
  animation: caret-pulse 1s ease-in-out infinite;
}
```

### 2. The "Thinking" State (AI Panel)

When the AI is working, show a **"Latent Space" gradient** instead of a spinner.

**Design**: Animated gradient border at the bottom of the input area.

```tsx
<div className="ai-input-container relative">
  <textarea {...props} />

  {isThinking && (
    <div className="absolute bottom-0 left-0 right-0 h-0.5">
      <div className="latent-gradient animate-gradient" />
    </div>
  )}
</div>
```

```css
.latent-gradient {
  background: linear-gradient(
    90deg,
    transparent,
    var(--accent),
    var(--accent-secondary),
    transparent
  );
  background-size: 200% 100%;
}

@keyframes gradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.animate-gradient {
  animation: gradient 2s ease infinite;
}
```

### 3. Streaming AI Responses

Messages should **fade in word-by-word**, not jerkily.

```tsx
{streamingMessage && (
  <motion.div
    initial={{ opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.15 }}
  >
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
  </motion.div>
)}
```

### 4. The Graph View

**Aesthetic**: Dark background, glowing nodes.

**Interaction**:
- Hovering a node **dims** all others except connected neighbors (Spotlight effect)
- Damped spring physics (nodes gently float, not bouncy)

**Color Scheme**:
- Node (default): `--surface` fill, `--border` stroke
- Node (hover): `--accent` glow (drop-shadow)
- Node (active): `--accent` fill
- Edge: `--border` (1px stroke)
- Edge (connected): `--accent-secondary`

**Implementation**: Use `react-force-graph` or D3.js with custom styling.

---

## Micro-interactions

### Scrollbars

Custom, minimal scrollbars:

```css
/* Hide scrollbar by default */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}

/* Show scrollbar only when scrolling */
.scroll-container {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.scroll-container:not(:hover)::-webkit-scrollbar-thumb {
  opacity: 0;
  transition: opacity 0.2s;
}
```

### Focus Mode

**Trigger**: Cmd+K or button in header
**Behavior**: Slide out both sidebars, expand center pane to full width

```tsx
<motion.div
  className="sidebar"
  animate={{ x: focusMode ? -240 : 0 }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
>
  <Sidebar />
</motion.div>
```

### Tooltip Delays

```tsx
<Tooltip delayDuration={500}> {/* 500ms delay before showing */}
  <TooltipTrigger>Hover me</TooltipTrigger>
  <TooltipContent>Tooltip text</TooltipContent>
</Tooltip>
```

---

## Iconography

**Library**: Lucide React
**Stroke Width**: 1.5px (elegant, not heavy)
**Size**: 16px (default), 20px (larger actions)

**Usage**:
```tsx
import { FileText, Search, Settings } from 'lucide-react';

<FileText className="w-4 h-4 text-text-secondary" />
```

---

## Accessibility

### Keyboard Shortcuts

All major actions should be keyboard-accessible:

- `Cmd+K`: Command palette / Focus mode
- `Cmd+N`: New note
- `Cmd+P`: Quick switcher (file search)
- `Cmd+/`: Toggle AI panel
- `Cmd+\`: Toggle sidebar
- `Cmd+Enter`: Send AI message

### Focus States

All interactive elements must have visible focus:

```css
.interactive:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

### Screen Reader Labels

```tsx
<button aria-label="Create new note">
  <Plus className="w-4 h-4" />
</button>
```

---

## Animation Library

**Tool**: Framer Motion
**Principles**:
- Use `AnimatePresence` for enter/exit animations
- Keep durations <200ms
- Use easing: `ease-out` for entering, `ease-in` for exiting

**Example: Panel Slide-In**:

```tsx
<AnimatePresence>
  {isPanelOpen && (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      <Panel />
    </motion.div>
  )}
</AnimatePresence>
```

---

## Responsive Behavior

**Breakpoints**:

```css
--screen-sm: 640px;
--screen-md: 768px;
--screen-lg: 1024px;
--screen-xl: 1280px;
```

**Mobile** (<768px):
- Stack panels vertically
- Hide sidebars by default (slide-in on demand)
- Full-width editor

**Tablet** (768px - 1024px):
- 2-pane layout (hide left sidebar)
- Center + Right visible

**Desktop** (>1024px):
- Full 3-pane layout

---

## Implementation Checklist

- [x] Design system documented
- [ ] Tailwind config with custom tokens
- [ ] Shadcn UI components installed
- [ ] 3-pane resizable layout
- [ ] Redesigned Editor component
- [ ] Redesigned AI Panel with streaming
- [ ] Custom scrollbars
- [ ] Focus mode
- [ ] Graph view styling
- [ ] Keyboard shortcuts
- [ ] Accessibility audit

---

**Next**: See [implementation guide](implementation.md) for step-by-step setup.
