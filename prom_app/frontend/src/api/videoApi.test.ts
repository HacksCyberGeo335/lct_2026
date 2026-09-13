import { describe, it, expect, vi } from 'vitest';
import {
  buildStorageObjectUrl,
  uploadDto,
  UploadSession,
  validateVideo,
  request,
  type UploadTransport,
} from './videoApi';
const id = '021472d8-a659-47de-893d-bedc24d015e7';
const ticket = {
  uuid: id,
  upload_url: 'http://localhost:9000/video-originals-prom',
  storage_key: 'video-originals-prom/' + id + '/камера #1 + запись.mp4',
};
const file = new File(['video'], 'камера #1 + запись.mp4', { type: 'video/mp4' });
function transport(): UploadTransport {
  return { init: vi.fn(async () => ticket), put: vi.fn(async () => {}), complete: vi.fn(async () => {}) };
}
describe('Boundary contracts', () => {
  it('joins bucket-in-key without duplicating bucket and encodes each segment', () => {
    expect(buildStorageObjectUrl(ticket)).toBe(
      'http://localhost:9000/video-originals-prom/' + id + '/' + encodeURIComponent(file.name),
    );
  });
  it('supports unprefixed key, prefixed public path and exact signed URL', () => {
    expect(buildStorageObjectUrl({ ...ticket, storage_key: id + '/x.mp4' })).toBe(
      'http://localhost:9000/video-originals-prom/' + id + '/x.mp4',
    );
    const signed = 'https://media.example/video/a.mp4?X-Amz-Signature=a%2Bz&X-Amz-Credential=a%2Fb';
    expect(buildStorageObjectUrl({ ...ticket, upload_url: signed })).toBe(signed);
    expect(
      buildStorageObjectUrl({ ...ticket, upload_url: 'https://media.example/s3/video-originals-prom' }),
    ).toContain('/s3/video-originals-prom/' + id + '/');
  });
  it('rejects malformed DTOs, empty files, mismatched MIME and dot segments', () => {
    expect(uploadDto.safeParse({ uuid: 'foo' }).success).toBe(false);
    expect(uploadDto.safeParse({ ...ticket, upload_url: 'javascript:alert(1)' }).success).toBe(false);
    expect(() => buildStorageObjectUrl({ ...ticket, storage_key: 'bucket/../x' })).toThrow();
    expect(validateVideo(new File([], 'x.mp4'))).toContain('пустой');
    expect(validateVideo(new File(['text'], 'x.mp4', { type: 'text/html' }))).toContain('Поддерживаются');
    expect(validateVideo(file)).toBeNull();
  });
  it('surfaces authorization errors and passes cancellation through fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    const signal = new AbortController().signal;
    await expect(request('/api', '/videos/x', {}, signal)).rejects.toThrow('Доступ запрещён');
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    vi.unstubAllGlobals();
  });
});
describe('Upload transaction', () => {
  it('executes init, PUT, complete strictly in order', async () => {
    const t = transport(),
      sequence: string[] = [];
    const session = new UploadSession(t);
    await session.run(
      file,
      new AbortController().signal,
      (s) => sequence.push(s),
      () => {},
    );
    expect(sequence).toEqual(['preparing', 'transferring', 'confirming']);
    expect(t.init).toHaveBeenCalledTimes(1);
    expect(t.put).toHaveBeenCalledTimes(1);
    expect(t.complete).toHaveBeenCalledWith(id, expect.any(AbortSignal));
  });
  it('never confirms failed PUT and retries the same initialized object', async () => {
    const t = transport();
    vi.mocked(t.put).mockRejectedValueOnce(new Error('CORS'));
    const session = new UploadSession(t),
      signal = new AbortController().signal;
    await expect(
      session.run(
        file,
        signal,
        () => {},
        () => {},
      ),
    ).rejects.toThrow('CORS');
    expect(t.complete).not.toHaveBeenCalled();
    await session.run(
      file,
      signal,
      () => {},
      () => {},
    );
    expect(t.init).toHaveBeenCalledTimes(1);
    expect(t.put).toHaveBeenCalledTimes(2);
  });
  it('retries confirmation without uploading bytes again', async () => {
    const t = transport();
    vi.mocked(t.complete).mockRejectedValueOnce(new Error('502'));
    const session = new UploadSession(t),
      signal = new AbortController().signal;
    await expect(
      session.run(
        file,
        signal,
        () => {},
        () => {},
      ),
    ).rejects.toThrow('502');
    expect(session.transferred).toBe(true);
    await session.run(
      file,
      signal,
      () => {},
      () => {},
    );
    expect(t.put).toHaveBeenCalledTimes(1);
    expect(t.complete).toHaveBeenCalledTimes(2);
  });
  it('does not confirm after cancellation and never auto-retries uncertain init', async () => {
    const t = transport(),
      controller = new AbortController();
    vi.mocked(t.put).mockImplementation(async () => {
      controller.abort();
    });
    await expect(
      new UploadSession(t).run(
        file,
        controller.signal,
        () => {},
        () => {},
      ),
    ).rejects.toThrow();
    expect(t.complete).not.toHaveBeenCalled();
    const uncertain = transport();
    vi.mocked(uncertain.init).mockRejectedValue(new Error('network'));
    await expect(
      new UploadSession(uncertain).run(
        file,
        new AbortController().signal,
        () => {},
        () => {},
      ),
    ).rejects.toThrow('network');
    expect(uncertain.init).toHaveBeenCalledTimes(1);
    expect(uncertain.put).not.toHaveBeenCalled();
  });
});
