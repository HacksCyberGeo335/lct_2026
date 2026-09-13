import type { Mode } from '../domain/models';
export function readConfig(env: Record<string, unknown>): { mode: Mode; apiBase: string } {
  const mode = env.VITE_APP_MODE ?? (env.PROD ? 'api' : 'demo');
  if (mode !== 'demo' && mode !== 'api')
    throw new Error(
      'VITE_APP_MODE должен быть demo или api. Исправьте конфигурацию и пересоберите приложение.',
    );
  const raw = String(env.VITE_API_BASE_URL ?? '/api').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s?#]+$/.test(raw) && !/^\/(?!\/)[^\s?#]*$/.test(raw))
    throw new Error('VITE_API_BASE_URL: ожидается /api или публичный HTTP(S) адрес Gateway.');
  return { mode, apiBase: raw.endsWith('/api') ? raw : raw + '/api' };
}
