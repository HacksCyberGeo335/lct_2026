import { z } from 'zod';
export const uploadDto = z.object({
  uuid: z.string().uuid(),
  upload_url: z.url().refine((s) => /^https?:\/\//.test(s)),
  storage_key: z.string().min(1),
});
export type UploadTicket = z.infer<typeof uploadDto>;

/** Current Go contract returns bucket URL and storage_key INCLUDING the bucket. */
export function buildStorageObjectUrl(ticket: UploadTicket): string {
  const url = new URL(ticket.upload_url);
  if ([...url.searchParams.keys()].some((k) => /signature|credential|x-amz-/i.test(k)))
    return ticket.upload_url;
  const key = ticket.storage_key.split('/');
  if (key.some((p) => !p || p === '.' || p === '..'))
    throw new Error('Некорректный storage_key в ответе сервера.');
  const current = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const encodedKey = key.map(encodeURIComponent).join('/');
  if (url.pathname.endsWith('/' + encodedKey)) return ticket.upload_url;
  if (current[current.length - 1] === key[0]) key.shift();
  url.pathname = url.pathname.replace(/\/+$/, '') + '/' + key.map(encodeURIComponent).join('/');
  return url.href;
}
export async function request(
  base: string,
  path: string,
  init: RequestInit,
  signal: AbortSignal,
  timeout = 20000,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('Превышено время ожидания', 'TimeoutError')),
    timeout,
  );
  try {
    const response = await fetch(base + path, {
      ...init,
      signal: controller.signal,
      credentials: 'same-origin',
    });
    if (!response.ok) {
      const message =
        response.status === 401
          ? 'Требуется авторизация.'
          : response.status === 403
            ? 'Доступ запрещён.'
            : response.status === 404
              ? 'Ресурс не найден.'
              : 'Сервер вернул HTTP ' + response.status + '.';
      throw new Error(message);
    }
    return response;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Передача отменена', 'AbortError');
    if (controller.signal.aborted)
      throw new Error('Сервер не ответил вовремя. Результат запроса может быть неизвестен.', {
        cause: error,
      });
    if (error instanceof TypeError)
      throw new Error('Не удалось связаться с сервером. Проверьте адрес Gateway, сеть и CORS.', {
        cause: error,
      });
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
export const initVideoUpload = async (base: string, file: File, signal: AbortSignal) => {
  const response = await request(
    base,
    '/videos/init-upload',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: file.name, size: file.size }),
    },
    signal,
  );
  const result = uploadDto.safeParse(await response.json());
  if (!result.success)
    throw new Error('Некорректный ответ init-upload. UUID мог быть создан; автоматический повтор отключён.');
  return result.data;
};
export const completeVideoUpload = async (base: string, uuid: string, signal: AbortSignal) => {
  await request(
    base,
    '/videos/' + encodeURIComponent(uuid) + '/upload-complete',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    signal,
  );
};
export function uploadVideoToStorage(
  file: File,
  ticket: UploadTicket,
  onProgress: (n: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const done = (error?: Error) => {
      signal.removeEventListener('abort', abort);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
      xhr.upload.onprogress = null;
      if (error) reject(error);
      else resolve();
    };
    if (signal.aborted) {
      reject(new DOMException('Отменено', 'AbortError'));
      return;
    }
    xhr.open('PUT', buildStorageObjectUrl(ticket));
    xhr.timeout = 30 * 60 * 1000;
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? done()
        : done(new Error('MinIO: HTTP ' + xhr.status + '. Файл не подтверждён.'));
    xhr.onerror = () =>
      done(new Error('Ошибка сети или CORS при передаче в MinIO. Проверьте публичный адрес хранилища.'));
    xhr.onabort = () => done(new DOMException('Передача отменена', 'AbortError'));
    xhr.ontimeout = () => done(new Error('Истекло время передачи в MinIO.'));
    signal.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}
// Backend enforces only size > 0; these are CLIENT limits, not backend policy.
export const MAX_FILE_SIZE = 2 * 1024 ** 3;
export function validateVideo(file: File): string | null {
  if (!file.size) return 'Файл пустой.';
  if (file.size > MAX_FILE_SIZE) return 'Лимит интерфейса — 2 ГБ на запись.';
  if (
    !/\.(mp4|webm|mov)$/i.test(file.name) ||
    (file.type && !['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type))
  )
    return 'Поддерживаются MP4, WebM и MOV. Воспроизведение зависит от кодека браузера.';
  return null;
}
export interface UploadTransport {
  init(file: File, signal: AbortSignal): Promise<UploadTicket>;
  put(file: File, ticket: UploadTicket, progress: (n: number) => void, signal: AbortSignal): Promise<void>;
  complete(uuid: string, signal: AbortSignal): Promise<void>;
}
export class UploadSession {
  ticket: UploadTicket | null = null;
  transferred = false;
  constructor(private transport: UploadTransport) {}
  async run(
    file: File,
    signal: AbortSignal,
    stage: (s: 'preparing' | 'transferring' | 'confirming') => void,
    progress: (n: number) => void,
  ) {
    signal.throwIfAborted();
    if (!this.ticket) {
      stage('preparing');
      this.ticket = await this.transport.init(file, signal);
    }
    signal.throwIfAborted();
    if (!this.transferred) {
      stage('transferring');
      await this.transport.put(file, this.ticket, progress, signal);
      signal.throwIfAborted();
      this.transferred = true;
    }
    signal.throwIfAborted();
    stage('confirming');
    await this.transport.complete(this.ticket.uuid, signal);
    signal.throwIfAborted();
    return this.ticket;
  }
}
