import { it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { useState } from 'react';
import { Modal } from './ui';
afterEach(cleanup);
it('dialog restores focus and unmounts after Escape', async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Открыть</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Импорт" description="Проверка">
          <input aria-label="Название" />
        </Modal>
      </>
    );
  }
  render(<Host />);
  const trigger = screen.getByText('Открыть');
  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole('dialog')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
