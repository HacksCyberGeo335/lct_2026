import type { Mode } from '../domain/models';
export function readConfig(env: Record<string, unknown>): { mode: Mode; apiBase: string } {
  const mode = env.VITE_APP_MODE ?? (env.PROD ? 'api' : 'demo');
  if (mode !== 'demo' && mode !== 'api')
    throw new Error(
      'VITE_APP_MODE должен быть demo или api. Исправьте конфигурацию и пересоберите приложение.',
    );
  const configured = String(env.VITE_API_BASE_URL ?? '/api');
  const invalid = () =>
    new Error(
      'VITE_API_BASE_URL: ожидается /api или публичный HTTP(S) адрес Gateway без логина, пароля, query и hash.',
    );
  if (/[\s?#\\]/.test(configured)) throw invalid();
  let raw: string;
  if (configured.startsWith('/') && !configured.startsWith('//')) {
    raw = configured.replace(/\/+$/, '');
  } else {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw invalid();
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid();
    raw = url.href.replace(/\/+$/, '');
  }
  return { mode, apiBase: raw.endsWith('/api') ? raw : raw + '/api' };
}
