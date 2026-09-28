// Extension allowlist: OS/browser MIME values are advisory, not content verification.
const videoFormats: Record<string, string[]> = {
  mp4: ['video/mp4'],
  m4v: ['video/mp4', 'video/x-m4v'],
  avi: ['video/x-msvideo', 'video/avi', 'video/msvideo'],
  mov: ['video/quicktime'],
  mkv: ['video/x-matroska', 'video/matroska', 'application/x-matroska'],
  webm: ['video/webm'],
  mpg: ['video/mpeg'],
  mpeg: ['video/mpeg'],
  wmv: ['video/x-ms-wmv'],
  '3gp': ['video/3gpp'],
  mts: ['video/mp2t'],
  m2ts: ['video/mp2t'],
  ogv: ['video/ogg', 'application/ogg'],
};
const imageFormats: Record<string, string[]> = {
  jpg: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  jpeg: ['image/jpeg', 'image/jpg', 'image/pjpeg'],
  png: ['image/png', 'image/x-png'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  bmp: ['image/bmp', 'image/x-bmp', 'image/x-ms-bmp'],
  avif: ['image/avif'],
  tif: ['image/tiff'],
  tiff: ['image/tiff'],
  heic: ['image/heic', 'image/heic-sequence'],
  heif: ['image/heif', 'image/heif-sequence'],
};
const extension = (name: string) => name.split('.').slice(1).at(-1)?.toLowerCase() ?? '';
export type MediaKind = 'video' | 'image';
export const videoFormatLabel = 'MP4, AVI, MOV, MKV, WebM, M4V, MPG/MPEG, WMV, 3GP, MTS/M2TS, OGV';
export const imageFormatLabel = 'JPEG/JPG, PNG, WebP, GIF, BMP, AVIF, TIFF, HEIC/HEIF';
export const mediaAccept = [...Object.keys(videoFormats), ...Object.keys(imageFormats)]
  .map((ext) => '.' + ext)
  .join(',');
export const maxVideoBytes = 2 * 1024 ** 3;
export const maxImageBytes = 20 * 1024 ** 2;
export const maxImages = 50;
export const maxBatchBytes = 200 * 1024 ** 2;

export function mediaKind(file: Pick<File, 'name'>): MediaKind | null {
  const ext = extension(file.name);
  return Object.hasOwn(videoFormats, ext) ? 'video' : Object.hasOwn(imageFormats, ext) ? 'image' : null;
}
export function mediaContentType(file: Pick<File, 'name' | 'type'>): string {
  const ext = extension(file.name);
  const formats = mediaKind(file) === 'video' ? videoFormats : imageFormats;
  return Object.hasOwn(formats, ext) ? formats[ext][0] : file.type || 'application/octet-stream';
}
export function validateMediaFile(file: File): string | null {
  if (!file.size) return 'Файл пустой.';
  const kind = mediaKind(file);
  if (!kind) return 'Поддерживаются только перечисленные форматы фото и видео.';
  const types = (kind === 'video' ? videoFormats : imageFormats)[extension(file.name)];
  const mime = file.type.toLowerCase().split(';')[0].trim();
  if (mime && mime !== 'application/octet-stream' && !types.includes(mime))
    return 'Тип файла не соответствует расширению. Выберите исходное фото или видео.';
  if (file.size > (kind === 'video' ? maxVideoBytes : maxImageBytes))
    return kind === 'video' ? 'Лимит интерфейса — 2 ГБ на видео.' : 'Лимит интерфейса — 20 МБ на фото.';
  return null;
}
export function validateMediaBatch(files: File[]): string | null {
  if (files.length > maxImages) return 'За один раз можно выбрать не более 50 фото.';
  for (const file of files) {
    const error = validateMediaFile(file);
    if (error) return file.name + ': ' + error;
  }
  if (files.length > 1 && files.some((file) => mediaKind(file) === 'video'))
    return 'Выберите одно видео или несколько фото. Видео загружаются по одному.';
  if (
    files.every((file) => mediaKind(file) === 'image') &&
    files.reduce((sum, f) => sum + f.size, 0) > maxBatchBytes
  )
    return 'Общий размер выбранных фото не должен превышать 200 МБ.';
  return null;
}
