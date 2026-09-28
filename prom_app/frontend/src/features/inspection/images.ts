import type { InspectionFrame } from '../../domain/inspection';
import { maxImages, maxBatchBytes, mediaKind, validateMediaFile } from '../../shared/mediaFiles';
export async function openImages(files: File[], existing: InspectionFrame[]): Promise<InspectionFrame[]> {
  if (!files.length) return [];
  if (!crypto.subtle || !crypto.randomUUID)
    throw new Error('Для проверки снимков откройте приложение через HTTPS или localhost.');
  if (files.length + existing.length > maxImages) throw new Error('В одном сеансе не более 50 снимков.');
  if (files.reduce((n, f) => n + f.size, 0) + existing.reduce((n, f) => n + f.bytes, 0) > maxBatchBytes)
    throw new Error('Общий размер снимков не должен превышать 200 МБ.');
  const frames: InspectionFrame[] = [];
  try {
    for (const file of files) {
      const error = validateMediaFile(file);
      if (error || mediaKind(file) !== 'image')
        throw new Error(file.name + ': ' + (error ?? 'Выберите фото.'));
      if (!/\.(png|jpe?g|webp|bmp|avif)$/i.test(file.name))
        throw new Error(
          file.name +
            ': для локальной проверки экспортируйте фото в JPEG или PNG. Исходный файл можно загрузить в разделе «Объекты».',
        );
      const bitmap = await createImageBitmap(file).catch(() => {
        throw new Error(
          file.name +
            ': браузер не смог открыть изображение. Для проверки снимков экспортируйте его в JPEG или PNG.',
        );
      });
      const { width, height } = bitmap;
      bitmap.close();
      if (width > 20000 || height > 20000 || width * height > 40_000_000)
        throw new Error(file.name + ': максимум 40 мегапикселей, сторона не более 20000 px.');
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      if ([...existing, ...frames].some((f) => f.sha256 === sha256))
        throw new Error(file.name + ': этот снимок уже добавлен.');
      frames.push({
        id: crypto.randomUUID(),
        name: file.name,
        url: URL.createObjectURL(file),
        width,
        height,
        sha256,
        bytes: file.size,
        origin: 'local',
        result: null,
      });
    }
    return frames;
  } catch (error) {
    frames.forEach((f) => URL.revokeObjectURL(f.url));
    throw error;
  }
}
