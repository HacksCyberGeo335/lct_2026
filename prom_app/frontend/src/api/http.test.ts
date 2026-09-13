// @vitest-environment node
import { beforeAll, afterAll, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { z } from 'zod';
import { request, readJson } from './http';

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  if (req.url === '/stalled') res.write('{"status":');
  else res.end(req.url === '/malformed' ? '{broken' : '{"status":"ok"}');
});
let base = '';
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server address');
  base = 'http://127.0.0.1:' + address.port;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const schema = z.object({ status: z.literal('ok') });
it('keeps the deadline active after headers while the JSON body stalls', async () => {
  let receivedHeaders = false;
  await expect(
    request(
      base,
      '/stalled',
      {},
      new AbortController().signal,
      async (response) => {
        receivedHeaders = true;
        return response.json();
      },
      300,
    ),
  ).rejects.toThrow('не ответил вовремя');
  expect(receivedHeaders).toBe(true);
});
it('cancels reading an in-flight response body', async () => {
  const controller = new AbortController();
  let bodyStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    bodyStarted = resolve;
  });
  const pending = request(base, '/stalled', {}, controller.signal, (response) => {
    bodyStarted();
    return response.json();
  });
  const result = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await started;
  controller.abort();
  await result;
});
it('validates JSON and reports malformed bodies without exposing their content', async () => {
  await expect(request(base, '/ok', {}, new AbortController().signal, readJson(schema))).resolves.toEqual({
    status: 'ok',
  });
  await expect(
    request(base, '/malformed', {}, new AbortController().signal, readJson(schema)),
  ).rejects.toThrow('некорректный JSON');
});
