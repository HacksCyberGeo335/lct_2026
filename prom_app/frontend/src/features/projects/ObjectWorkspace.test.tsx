import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ObjectWorkspace } from './ObjectWorkspace';
import { emptyProjectFields } from './model';
import type { ManagedProject, ProjectRepository } from './repository';
const object: ManagedProject = {
  ...emptyProjectFields,
  id: 'server-1',
  version: 'v7',
  name: 'Серверный объект',
  address: 'Адрес',
  developer: 'Застройщик',
  plan: { name: 'Серверный график', stages: [] },
};
afterEach(cleanup);
function setup(overrides: Partial<ProjectRepository> = {}) {
  const repository: ProjectRepository = {
    available: true,
    list: vi.fn(async () => [object]),
    create: vi.fn(),
    update: vi.fn(async () => object),
    remove: vi.fn(async () => {}),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ObjectWorkspace repository={repository} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return repository;
}
it('selects an existing server object and sends removal of its plan only on explicit save', async () => {
  const repository = setup();
  await screen.findByText('Серверный объект');
  fireEvent.click(screen.getByRole('button', { name: 'Создать график работ' }));
  fireEvent.change(screen.getByLabelText('Объект для графика', { exact: true }), {
    target: { value: object.id },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  fireEvent.click(screen.getByRole('button', { name: 'Удалить график' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Подтвердить удаление' }));
  expect(repository.update).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button', { name: 'Сохранить объект и график' }));
  await waitFor(() =>
    expect(repository.update).toHaveBeenCalledWith(
      object,
      expect.objectContaining({ name: object.name }),
      null,
    ),
  );
  expect(repository.create).not.toHaveBeenCalled();
  await screen.findByText('Объект и его график сохранены на сервере.');
});
it('keeps the object and confirmation open when server deletion fails', async () => {
  const repository = setup({
    remove: vi.fn(async () => {
      throw new Error('Version conflict');
    }),
  });
  await screen.findByText('Серверный объект');
  fireEvent.click(screen.getByRole('button', { name: 'Удалить объект' }));
  expect(repository.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление объекта' }));
  await screen.findByText('Version conflict');
  expect(repository.remove).toHaveBeenCalledWith(object);
  expect(screen.queryByRole('heading', { name: object.name, hidden: true })).not.toBeNull();
  expect(screen.queryByText('Объект удалён.')).toBeNull();
});
