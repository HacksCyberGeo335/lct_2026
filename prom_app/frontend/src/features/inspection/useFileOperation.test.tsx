import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFileOperation } from './useFileOperation';
afterEach(cleanup);
it('serializes operations and allows retry after failure', async () => {
  const onBusy = vi.fn();
  const { result } = renderHook(() => useFileOperation(false, onBusy));
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let first!: Promise<void>;
  act(() => {
    first = result.current.run(() => blocked);
  });
  const duplicate = vi.fn();
  await act(async () => {
    await result.current.run(duplicate);
  });
  expect(duplicate).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(true);
  await act(async () => {
    finish();
    await first;
  });
  await act(async () => {
    await result.current.run(async () => {
      throw new Error('Ошибка файла');
    });
  });
  expect(result.current.error).toBe('Ошибка файла');
  expect(result.current.busy).toBe(false);
  await act(async () => {
    await result.current.run(async () => {});
  });
  expect(result.current.error).toBe('');
  expect(onBusy.mock.calls.flat()).toEqual([true, false, true, false, true, false]);
});
it('aborts transport and invalidates late file reads when unmounted', async () => {
  const onBusy = vi.fn();
  const { result, unmount } = renderHook(() => useFileOperation(false, onBusy));
  let finish!: () => void;
  const blocked = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let signal!: AbortSignal,
    current = -1,
    pending!: Promise<void>;
  const version = result.current.version;
  act(() => {
    pending = result.current.run(async (token, abort) => {
      signal = abort;
      current = token;
      await blocked;
    });
  });
  unmount();
  expect(signal.aborted).toBe(true);
  expect(version.current).not.toBe(current);
  finish();
  await pending;
  expect(onBusy.mock.calls.flat()).toEqual([true, false]);
});
