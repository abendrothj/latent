---
tags: [latent, features, ai]
created: 2024-01-15
---

# AI Assistant

The AI assistant in Latent is your research companion. It can read, search, and write notes on your behalf.

## Capabilities

### 1. Semantic Search

Ask natural language questions and the AI will search across all your notes using vector embeddings:

```
"What do I know about machine learning?"
"Find notes related to quantum entanglement"
```

### 2. Note Reading

The assistant can read specific notes to answer your questions:

```
"Summarize my quantum computing note"
"What does my note on AI say about transformers?"
```

### 3. Note Creation

Ask the AI to create new notes based on your research:

```
"Create a note summarizing our conversation about quantum mechanics"
"Write a note comparing GPT-4 and Claude"
```

### 4. Knowledge Graph Queries

Explore connections between notes:

```
"What notes link to my quantum computing note?"
"Show me all notes tagged with 'physics'"
```

## How It Works

The assistant uses **function calling** (tool use) to interact with your notes:

- `read_note`: Read a specific note
- `search_notes`: Semantic search across all notes
- `write_note`: Create or update notes
- `update_frontmatter`: Update note metadata
- `list_backlinks`: Find notes that link to a target

## Privacy

All AI processing happens via:

- **Cloud APIs** (OpenAI, Anthropic): Your choice, encrypted in transit
- **Local models** (Ollama): 100% private, runs on your machine

Your notes **never leave your machine** unless you explicitly use a cloud API. The database and embeddings are stored locally.

## Tips

1. **Be specific**: "Search my notes about GPT-4's architecture" works better than "tell me about AI"
2. **Ask follow-ups**: The assistant remembers the conversation context
3. **Request citations**: Ask "which note says this?" to trace sources
4. **Use context**: The assistant knows which note you're viewing

## Configuration

Configure the AI provider in Settings:

- **Provider**: OpenAI, Anthropic, Ollama, Custom
- **Model**: Choose your preferred model
- **API Key**: For cloud providers (stored securely)
- **Base URL**: For local or custom endpoints

## Related

- [[semantic-search|Semantic Search]]
- [[markdown-guide|Markdown Guide]]
- [[welcome|Welcome]]
