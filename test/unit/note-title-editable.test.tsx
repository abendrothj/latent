import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NoteTitleEditable from '../../src/renderer/components/Editor/NoteTitleEditable';

describe('NoteTitleEditable', () => {
  const OLD_PATH = 'notes/old-note.md';

  beforeEach(() => {
    // Mock electron API
    (window as any).electron = {
      renameNote: vi.fn().mockResolvedValue('Renamed'),
    };
  });

  it('starts editing when pencil clicked and saves with Enter', async () => {
    render(<NoteTitleEditable path={OLD_PATH} title={'Untitled'} onRenamed={() => {}} />);

    const pencil = screen.getByRole('button', { name: /rename note/i });
    await userEvent.click(pencil);

    const input = screen.getByLabelText(/edit note title/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'New Title{Enter}');

    expect((window as any).electron.renameNote).toHaveBeenCalledWith(
      expect.objectContaining({ oldPath: OLD_PATH, newPath: expect.stringContaining('new-title.md') })
    );
  });

  it('cancels edit on Escape', async () => {
    render(<NoteTitleEditable path={OLD_PATH} title={'Foo'} onRenamed={() => {}} />);

    const pencil = screen.getByRole('button', { name: /rename note/i });
    await userEvent.click(pencil);

    const input = screen.getByLabelText(/edit note title/i);
    await userEvent.type(input, 'Bar{Escape}');

    expect(screen.getByText('Foo')).toBeInTheDocument();
  });
});
