import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Editor from '../../src/renderer/components/Editor';

// Mock electron API used by Editor
beforeEach(() => {
  (window as any).electron = {
    readNote: vi.fn().mockResolvedValue('# Hello\n\nContent'),
    writeNote: vi.fn().mockResolvedValue('Saved'),
  };
});

test('default is write-only and toggles preview with button and keyboard', async () => {
  const user = userEvent.setup();
  render(<Editor currentNote={'test.md'} onNoteChange={() => {}} />);

  // By default preview should be hidden
  expect(screen.queryByText('Content')).not.toBeInTheDocument();

  // Toggle preview via button
  const toggle = screen.getByTitle(/toggle preview/i);
  await user.click(toggle);
  expect(await screen.findByText('Content')).toBeInTheDocument();

  // Toggle via keyboard shortcut (Ctrl+Shift+P)
  await user.keyboard('{Control}{Shift}p');
  expect(screen.queryByText('Content')).not.toBeInTheDocument();
});

test('resizer keyboard arrows adjust split', async () => {
  const user = userEvent.setup();
  render(<Editor currentNote={'test.md'} onNoteChange={() => {}} />);

  // Show preview
  const toggle = screen.getByTitle(/toggle preview/i);
  await user.click(toggle);

  const separator = screen.getByRole('separator');
  separator.focus();

  const before = separator.getAttribute('aria-valuenow');
  await user.keyboard('{ArrowRight}');
  const after = separator.getAttribute('aria-valuenow');
  expect(Number(after)).not.toBe(Number(before));
});