# Latent Test Suite

Comprehensive test coverage for all Latent features.

## Test Structure

```
test/
├── setup.ts                    # Global test setup and teardown
├── fixtures/
│   └── mockData.ts            # Mock data for testing
├── unit/                      # Unit tests for individual components
│   ├── parser.test.ts        # Markdown parsing
│   ├── chunker.test.ts       # Text chunking
│   ├── database.test.ts      # Database operations
│   └── tools.test.ts         # AI tools
└── integration/              # Integration tests
    └── indexer.test.ts       # End-to-end indexer tests
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Specific file
npm test -- parser.test.ts
```

### Watch Mode

```bash
npm test -- --watch
```

### Coverage Report

```bash
npm run test:coverage
```

Coverage reports are generated in `coverage/` directory.

## Test Categories

### Unit Tests

#### 1. Markdown Parser (`parser.test.ts`)

Tests markdown parsing functionality:

- ✅ Extract frontmatter (YAML)
- ✅ Extract title from first H1
- ✅ Parse wikilinks (`[[note]]`, `[[note|alias]]`)
- ✅ Parse embeds (`![[image.png]]`)
- ✅ Parse markdown links
- ✅ Word counting with markdown filtering
- ✅ Edge cases (empty input, no title, etc.)

**Coverage**: 15 tests

#### 2. Text Chunker (`chunker.test.ts`)

Tests text chunking for embeddings:

- ✅ Chunk long documents into multiple chunks
- ✅ Respect chunk size limits (token-based)
- ✅ Create overlap between consecutive chunks
- ✅ Handle short text (no chunking needed)
- ✅ Merge tiny final chunks
- ✅ Semantic chunking (paragraph-based)
- ✅ Edge cases (empty input, very small chunks)

**Coverage**: 12 tests

#### 3. Database Operations (`database.test.ts`)

Tests SQLite database layer:

- ✅ Embedding serialization/deserialization
- ✅ Cosine similarity calculations
- ✅ Document CRUD operations
- ✅ Chunk insertion and cascade deletion
- ✅ Link insertion and backlink queries
- ✅ Vector search functionality
- ✅ Top-K result limiting
- ✅ Foreign key constraints

**Coverage**: 18 tests

#### 4. AI Tools (`tools.test.ts`)

Tests function calling tools:

- ✅ `read_note`: Read file content
- ✅ `write_note`: Create/update files
- ✅ `update_frontmatter`: Modify YAML frontmatter
- ✅ `search_notes`: Semantic search
- ✅ `list_backlinks`: Find backlinks
- ✅ Path validation (prevent directory traversal)
- ✅ Error handling (missing files, invalid tools)
- ✅ JSON argument parsing

**Coverage**: 15 tests

### Integration Tests

#### Indexer Integration (`indexer.test.ts`)

Tests the complete indexing pipeline:

- ✅ Index single file (file → database)
- ✅ Index multiple files
- ✅ Extract and store links
- ✅ Skip unchanged files (checksum comparison)
- ✅ Handle file deletion
- ✅ Progress reporting (events)
- ✅ Real-time file watching (new files, modifications)
- ✅ Error handling (missing provider, embedding failures)

**Coverage**: 10+ tests

## Test Data

### Mock Notes

Located in `test/fixtures/mockData.ts`:

- `mockNotes.simple`: Basic markdown
- `mockNotes.withFrontmatter`: YAML frontmatter
- `mockNotes.withWikilinks`: Wikilinks and embeds
- `mockNotes.withMarkdownLinks`: Markdown links
- `mockNotes.long`: Long document for chunking
- `mockNotes.quantumComputing`: Realistic example

### Mock Responses

- `mockEmbedding`: 1536-dimensional vector
- `mockChatResponse`: AI chat response
- `mockSearchResults`: Search results
- `mockDocument`: Database document record
- `mockChunk`: Database chunk record
- `mockLink`: Database link record

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  describe('function name', () => {
    it('should do something', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle edge case', () => {
      expect(() => functionUnderTest(null)).toThrow();
    });
  });
});
```

### Integration Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Integration Test', () => {
  beforeEach(async () => {
    // Setup: create test files, initialize database
  });

  afterEach(async () => {
    // Cleanup: remove test files, close connections
  });

  it('should work end-to-end', async () => {
    // Test complete workflow
  });
});
```

## Mocking

### Mock LLM Provider

```typescript
const mockProvider = {
  name: 'mock',
  chat: vi.fn().mockResolvedValue(mockChatResponse),
  embed: vi.fn().mockResolvedValue({
    embeddings: [mockEmbedding],
    model: 'mock-model',
  }),
};

setLLMProvider(mockProvider);
```

### Mock Database

```typescript
const queries = require('../../src/main/db/queries');
queries.getDatabase = () => testDb;
```

## Performance Testing

Tests include performance assertions:

- Chunking 1000 words should complete <1s
- Vector search on 100 documents <100ms
- Database operations <10ms

## Continuous Integration

Tests run automatically on:

- Every commit (pre-commit hook)
- Pull requests (CI pipeline)
- Before deployment

### CI Configuration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## Debugging Tests

### Run Single Test

```bash
npm test -- -t "should parse frontmatter"
```

### Enable Verbose Output

```bash
npm test -- --reporter=verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["test", "--", "--run"],
  "console": "integratedTerminal"
}
```

## Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| Statements | 80% | TBD |
| Branches | 75% | TBD |
| Functions | 80% | TBD |
| Lines | 80% | TBD |

Run `npm run test:coverage` to see current coverage.

## Known Issues

- Integration tests may be slow due to file I/O and delays for file watching
- Some tests require longer timeouts for indexing to complete
- Mock provider doesn't test actual AI behavior (only interface)

## Future Enhancements

- [ ] Add E2E tests with Playwright (UI testing)
- [ ] Add performance benchmarks
- [ ] Add snapshot testing for UI components
- [ ] Add API integration tests (real OpenAI/Ollama calls in CI)
- [ ] Add mutation testing (Stryker)
- [ ] Add visual regression testing

## Troubleshooting

### Tests Fail with "ENOENT"

Ensure test directories exist:

```bash
mkdir -p test/.tmp/vault
```

### Tests Timeout

Increase timeout in specific tests:

```typescript
it('slow test', async () => {
  // ...
}, 10000); // 10 second timeout
```

### Database Lock Errors

Ensure database is properly closed:

```typescript
afterEach(() => {
  db.close();
});
```

## Contributing

When adding new features:

1. Write tests first (TDD)
2. Ensure all tests pass
3. Maintain coverage >80%
4. Update this README if adding new test categories
