import { z } from 'zod';

/** The deadline covers both response headers and consumption of the response body. */
export async function request<T>(
  base: string,
  path: string,
  init: RequestInit,
  signal: AbortSignal,
  read: (response: Response) => Promise<T>,
  timeout = 20000,
): Promise<T> {
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
      const messages: Record<number, string> = {
        401: 'Требуется авторизация.',
        403: 'Доступ запрещён.',
        404: 'Ресурс не найден.',
      };
      throw new Error(messages[response.status] ?? 'Сервер вернул HTTP ' + response.status + '.');
    }
    const result = await read(response);
    controller.signal.throwIfAborted();
    return result;
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
    if (error instanceof SyntaxError)
      throw new Error('Сервер вернул некорректный JSON. Результат запроса может быть неизвестен.', {
        cause: error,
      });
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export function readJson<T>(schema: z.ZodType<T>, message = 'Некорректный ответ сервера.') {
  return async (response: Response): Promise<T> => {
    const result = schema.safeParse(await response.json());
    if (!result.success) throw new Error(message);
    return result.data;
  };
}
