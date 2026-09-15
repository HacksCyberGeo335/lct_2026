import type { InspectionFrame } from '../../domain/inspection';
export const maxImages = 50;
export const maxImageBytes = 20 * 1024 * 1024;
export const maxBatchBytes = 200 * 1024 * 1024;
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
      if (
        !file.size ||
        file.size > maxImageBytes ||
        !/\.(png|jpe?g|webp)$/i.test(file.name) ||
        (file.type && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      )
        throw new Error(file.name + ': нужен непустой PNG, JPEG или WebP размером до 20 МБ.');
      const bitmap = await createImageBitmap(file).catch(() => {
        throw new Error(file.name + ': изображение повреждено или не поддерживается.');
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
