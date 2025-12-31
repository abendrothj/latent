import React from 'react';
import { render } from '@testing-library/react';
import App from '../../src/renderer/App';

test('announce events populate aria-live region', () => {
  const { container } = render(<App />);

  // Dispatch announcement
  window.dispatchEvent(new CustomEvent('announce', { detail: 'Test announcement' }));

  const live = container.querySelector('[aria-live]');
  expect(live).toBeTruthy();
  expect(live?.textContent).toBe('Test announcement');
});