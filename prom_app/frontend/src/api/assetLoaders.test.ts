// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { loadCatalog } from './catalog';
import { loadInspectionDemo } from './inspectionDemo';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
for (const [name, load] of [
  ['catalog', loadCatalog],
  ['demo', loadInspectionDemo],
] as const) {
  for (const phase of ['headers', 'body']) {
    it(name + ' times out while waiting for ' + phase + ' and aborts the request', async () => {
      vi.useFakeTimers();
      let requestSignal: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init: RequestInit) => {
          requestSignal = init.signal as AbortSignal;
          const pending = () =>
            new Promise<never>((_resolve, reject) =>
              requestSignal!.addEventListener('abort', () => reject(requestSignal!.reason), { once: true }),
            );
          return phase === 'headers' ? pending() : Promise.resolve({ ok: true, json: pending });
        }),
      );
      const result = expect(load(new AbortController().signal)).rejects.toThrow('Время загрузки истекло');
      await vi.advanceTimersByTimeAsync(20000);
      await result;
      expect(requestSignal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });
  }
  it(name + ' preserves caller cancellation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
          }),
      ),
    );
    const abort = new AbortController();
    const result = expect(load(abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort();
    await result;
  });
}

it('catalog file bodies have a deadline after the manifest was loaded', async () => {
  vi.useFakeTimers();
  const manifest = JSON.parse(readFileSync('public/catalog/manifest.json', 'utf8'));
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () => manifest,
        arrayBuffer: () =>
          new Promise((_resolve, reject) =>
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true }),
          ),
      }),
    ),
  );
  const result = expect(loadCatalog(new AbortController().signal)).rejects.toThrow('Время загрузки истекло');
  await vi.advanceTimersByTimeAsync(20000);
  await result;
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(vi.getTimerCount()).toBe(0);
});
