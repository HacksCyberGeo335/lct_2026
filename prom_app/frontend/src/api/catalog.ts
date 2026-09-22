import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { parseCatalog } from '../domain/catalog';
const file = z.object({
  file: z.string().regex(/^construction_work_[a-z_]+\.json$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 * 1024),
  schema_version: z.string(),
});
export const catalogManifestSchema = z.object({
  version: z.literal(1),
  id: z.literal('construction-reviewed-2026-09-18'),
  reviewed_on: z.literal('2026-09-18'),
  files: z.object({ cards: file, equipment: file, durations: file }),
});
export async function loadCatalog(signal: AbortSignal) {
  const response = await fetch('/catalog/manifest.json', { signal });
  if (!response.ok) throw new Error('Справочник недоступен. Проверьте соединение и повторите загрузку.');
  const manifest = catalogManifestSchema.parse(await response.json());
  if (!crypto.subtle) throw new Error('Для проверки целостности справочника откройте HTTPS или localhost.');
  const values = await Promise.all(
    ['cards', 'equipment', 'durations'].map(async (role) => {
      const meta = manifest.files[role as keyof typeof manifest.files];
      const r = await fetch('/catalog/' + meta.file, { signal });
      if (!r.ok) throw new Error('Не удалось загрузить файл справочника: ' + role);
      const bytes = await r.arrayBuffer();
      if (bytes.byteLength !== meta.bytes)
        throw new Error('Размер файла справочника не совпадает с манифестом.');
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      if (hash !== meta.sha256)
        throw new Error('Нарушена целостность справочника. Обновите файлы одним комплектом.');
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (z.object({ schema_version: z.string() }).parse(value).schema_version !== meta.schema_version)
        throw new Error('Версия файла отличается от манифеста.');
      return value;
    }),
  );
  return parseCatalog(manifest.id, values[0], values[1], values[2]);
}
export function useCatalog() {
  return useQuery({
    queryKey: ['catalog', '2026-09-18'],
    queryFn: ({ signal }) => loadCatalog(signal),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}
