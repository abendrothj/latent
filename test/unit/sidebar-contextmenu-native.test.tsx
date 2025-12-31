import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sidebar } from '../../src/renderer/components/Sidebar/Sidebar';

beforeEach(() => {
  (window as any).electron = {
    listDocuments: vi.fn().mockResolvedValue([
      { id: 1, path: 'a.md', title: 'A', checksum: '', word_count: 0, created_at: 0, modified_at: 0, last_indexed_at: null, frontmatter: null },
    ]),
  };
});

test('contextmenu events in sidebar prevent native context menu and open custom menu', async () => {
  render(<Sidebar onSelectNote={() => {}} />);

  const item = await screen.findByText('A');

  let defaulted = false;
  document.addEventListener('contextmenu', (e) => { defaulted = e.defaultPrevented; }, { once: true });

  fireEvent.contextMenu(item);

  // custom menu should be visible
  expect(await screen.findByRole('menu')).toBeInTheDocument();
  // native default should be prevented
  expect(defaulted).toBe(true);
});