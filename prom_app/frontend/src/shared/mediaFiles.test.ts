import { describe, expect, it } from 'vitest';
import {
  mediaAccept,
  mediaContentType,
  mediaKind,
  validateMediaBatch,
  validateMediaFile,
  maxImageBytes,
  maxVideoBytes,
} from './mediaFiles';
const file = (name: string, type = '', size = 10) => {
  const value = new File(['data'], name, { type });
  Object.defineProperty(value, 'size', { value: size });
  return value;
};
describe('photo and video uploads', () => {
  it.each([
    ['recording.MP4', 'video/mp4', 'video'],
    ['a.avi', 'video/x-msvideo', 'video'],
    ['a.mov', 'video/quicktime', 'video'],
    ['a.mkv', 'application/octet-stream', 'video'],
    ['a.jpeg', 'image/jpeg', 'image'],
    ['a.png', '', 'image'],
    ['a.heic', 'image/heic', 'image'],
    ['a.tiff', 'image/tiff', 'image'],
    ['a.webp', 'image/webp', 'image'],
    ['a.avif', 'image/avif', 'image'],
  ])('accepts %s with the OS MIME %s', (name, type, kind) => {
    expect(validateMediaFile(file(name, type))).toBeNull();
    expect(mediaKind(file(name, type))).toBe(kind);
  });
  it('covers every picker extension and supplies MIME when the OS omits it', () => {
    for (const ext of mediaAccept.split(',')) {
      expect(validateMediaFile(file('capture' + ext))).toBeNull();
      expect(mediaContentType(file('capture' + ext))).not.toBe('application/octet-stream');
    }
    expect(mediaContentType(file('a.MKV', 'application/octet-stream'))).toBe('video/x-matroska');
    expect(mediaContentType(file('a.jpeg'))).toBe('image/jpeg');
  });
  it('rejects unsupported extensions and contradictory MIME types', () => {
    for (const name of ['a.svg', 'a.html', 'a.exe', 'a.mp4.exe', 'png', 'a.constructor', 'a.__proto__'])
      expect(validateMediaFile(file(name))).not.toBeNull();
    expect(validateMediaFile(file('a.png', 'video/mp4'))).toContain('не соответствует');
    expect(validateMediaFile(file('a.mp4', 'text/html'))).toContain('не соответствует');
  });
  it('enforces per-file limits without allocating huge buffers', () => {
    expect(validateMediaFile(file('a.png', '', 0))).toContain('пустой');
    expect(validateMediaFile(file('a.png', '', maxImageBytes))).toBeNull();
    expect(validateMediaFile(file('a.png', '', maxImageBytes + 1))).toContain('20 МБ');
    expect(validateMediaFile(file('a.avi', '', maxVideoBytes))).toBeNull();
    expect(validateMediaFile(file('a.avi', '', maxVideoBytes + 1))).toContain('2 ГБ');
  });
  it('validates the entire photo batch before uploading anything', () => {
    expect(validateMediaBatch([file('a.jpeg'), file('b.png')])).toBeNull();
    expect(validateMediaBatch([file('a.jpeg'), file('bad.exe')])).toContain('bad.exe');
    expect(validateMediaBatch([file('a.jpeg'), file('b.mp4')])).toContain('одно видео');
    expect(validateMediaBatch([file('a.mp4'), file('b.avi')])).toContain('одно видео');
    expect(validateMediaBatch(Array.from({ length: 50 }, () => file('a.png')))).toBeNull();
    expect(validateMediaBatch(Array.from({ length: 51 }, () => file('a.png')))).toContain('50');
    expect(validateMediaBatch(Array.from({ length: 10 }, () => file('a.png', '', maxImageBytes)))).toBeNull();
    expect(validateMediaBatch(Array.from({ length: 11 }, () => file('a.png', '', maxImageBytes)))).toContain(
      '200 МБ',
    );
  });
});
