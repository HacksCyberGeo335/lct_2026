import { z } from 'zod';

export const demoStoragePrefix = 'stroykontrol:demo:v1:';
export function readDemo<T>(key: string, schema: z.ZodType<T>, fallback: T): T {
  let saved: string | null;
  try {
    saved = localStorage.getItem(demoStoragePrefix + key);
  } catch {
    throw new Error(
      'Локальное хранилище недоступно. Разрешите хранение данных в браузере и повторите запрос.',
    );
  }
  if (saved === null) return fallback;
  try {
    return schema.parse(JSON.parse(saved));
  } catch {
    throw new Error('Сохранённые демоданные повреждены. Их можно восстановить из исходного набора.');
  }
}
export function writeDemo(key: string, value: unknown) {
  try {
    localStorage.setItem(demoStoragePrefix + key, JSON.stringify(value));
  } catch {
    throw new Error(
      'Не удалось сохранить в браузере: хранилище недоступно или заполнено. Изменения не применены.',
    );
  }
}
export function resetDemoPlan(id: string) {
  try {
    localStorage.removeItem(demoStoragePrefix + 'plan:' + id);
  } catch {
    throw new Error('Не удалось восстановить план: локальное хранилище недоступно.');
  }
}
export function resetDemo() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(demoStoragePrefix))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    throw new Error(
      'Не удалось завершить сброс локального хранилища. Часть данных могла быть сброшена; повторите попытку.',
    );
  }
}
