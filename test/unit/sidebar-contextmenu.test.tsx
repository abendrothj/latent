import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../../src/renderer/components/Sidebar/Sidebar';

beforeEach(() => {
  (window as any).electron = {
    listDocuments: vi.fn().mockResolvedValue([
      { id: 1, path: 'a.md', title: 'A', checksum: '', word_count: 0, created_at: 0, modified_at: 0, last_indexed_at: null, frontmatter: null },
    ]),
    deleteNote: vi.fn().mockResolvedValue('Deleted'),
  };
});

test('shows context menu on right click and delete invokes deleteNote', async () => {
  const user = userEvent.setup();
  render(<Sidebar onSelectNote={() => {}} />);

  // wait for docs to load
  const item = await screen.findByText('A');

  // mock native menu selection to Delete
  (window as any).electron.showContextMenu = vi.fn().mockResolvedValue({ id: 'delete' });

  // click to open native menu
  fireEvent.contextMenu(item);

  // confirm dialog will appear; mock confirm to return true
  vi.stubGlobal('confirm', () => true);

  // showContextMenu should have been called
  expect((window as any).electron.showContextMenu).toHaveBeenCalled();

  // deleteNote should be called as a result
  expect((window as any).electron.deleteNote).toHaveBeenCalledWith({ path: 'a.md' });

  // restore
  vi.unstubAllGlobals();
});

test('rename menu dispatches sidebar:rename event and selects note', async () => {
  const onSelect = vi.fn();
  render(<Sidebar onSelectNote={onSelect} />);

  const item = await screen.findByText('A');

  // mock native menu selection to Rename
  (window as any).electron.showContextMenu = vi.fn().mockResolvedValue({ id: 'rename' });

  const renameListener = vi.fn();
  window.addEventListener('sidebar:rename', renameListener as any);

  fireEvent.contextMenu(item);

  expect((window as any).electron.showContextMenu).toHaveBeenCalled();
  expect(onSelect).toHaveBeenCalledWith('a.md');
  expect(renameListener).toHaveBeenCalled();

  window.removeEventListener('sidebar:rename', renameListener as any);
});