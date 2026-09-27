import { expect, it } from 'vitest';
import { readConfig } from './config';
import { demoAvailable } from '../app/demoExtension';
import { source, UnsupportedError } from '../api/source';
it('defaults production to API and only enables demo when the branch includes the extension', () => {
  expect(readConfig({ PROD: true }).mode).toBe('api');
  expect(readConfig({}).mode).toBe(demoAvailable ? 'demo' : 'api');
  if (!demoAvailable) expect(() => readConfig({ VITE_APP_MODE: 'demo' })).toThrow('ветку demo');
  expect(() => readConfig({ VITE_APP_MODE: 'unknown' })).toThrow('demo или api');
});
it('normalizes API roots and rejects credential-bearing or ambiguous endpoints', () => {
  expect(readConfig({ VITE_API_BASE_URL: '/' }).apiBase).toBe('/api');
  expect(readConfig({ VITE_API_BASE_URL: 'http://localhost:8080' }).apiBase).toBe(
    'http://localhost:8080/api',
  );
  for (const url of [
    'http://host:bad',
    'https://user:pass@example.com',
    '//other-host',
    '/api?token=x',
    'https://example.com/#hash',
  ])
    expect(() => readConfig({ VITE_API_BASE_URL: url })).toThrow('VITE_API_BASE_URL');
});
it('does not invent endpoints for missing backend features', async () => {
  const signal = new AbortController().signal;
  const api = source('api');
  for (const operation of [
    () => api.objects(signal),
    () => api.report('local', 7, signal),
    () => api.settings('local', signal),
    () => api.savePlan('local', []),
  ])
    await expect(operation()).rejects.toBeInstanceOf(UnsupportedError);
  if (!demoAvailable) await expect(source('demo').objects(signal)).rejects.toBeInstanceOf(UnsupportedError);
});
