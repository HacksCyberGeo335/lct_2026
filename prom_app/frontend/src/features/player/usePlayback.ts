import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export function parsePosition(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}
const finiteDuration = (value: number) => (Number.isFinite(value) && value > 0 ? value : null);
export function formatPlaybackTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--';
  const value = Math.max(0, Math.floor(seconds));
  return (
    Math.floor(value / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (value % 60).toString().padStart(2, '0')
  );
}

/** Playback time belongs to the player; only deliberate seeks update the route. */
export function usePlayback(
  stills: boolean,
  sampleDuration: number,
  requestedTime: number,
  onSeek: (time: number) => void,
) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(requestedTime);
  const [duration, setDuration] = useState<number | null>(stills ? finiteDuration(sampleDuration) : null);
  const [playing, setPlaying] = useState(false);
  const [hasFrame, setHasFrame] = useState(stills);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    // Suspense may prepare media before insertion into the document, so the
    // initial metadata/error events can precede React's event handling.
    setDuration(finiteDuration(element.duration));
    setHasFrame(element.readyState >= 2 && !element.seeking);
    setPlaying(!element.paused);
    if (element.error) setError('Запись недоступна или её кодек не поддерживается браузером.');
  }, []);
  useEffect(() => {
    const next = duration === null ? requestedTime : Math.min(duration, requestedTime);
    if (video.current && video.current.readyState >= 1 && Math.abs(video.current.currentTime - next) > 0.001)
      video.current.currentTime = next;
    setTime(next);
  }, [requestedTime, duration]);
  function seek(value: number) {
    if (duration === null) return;
    const next = Math.max(0, Math.min(duration, value));
    if (video.current) video.current.currentTime = next;
    setTime(next);
    onSeek(next);
  }
  async function play() {
    const element = video.current;
    if (!element) return;
    try {
      if (element.paused) await element.play();
      else element.pause();
    } catch (cause) {
      // A rapid pause/source change cancels play(); it is not a decoding failure.
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError('Браузер не смог воспроизвести запись. Проверьте формат и кодек.');
    }
  }
  function updateDuration(event: SyntheticEvent<HTMLVideoElement>) {
    setDuration(finiteDuration(event.currentTarget.duration));
  }
  function retry() {
    setError('');
    setHasFrame(false);
    video.current?.load();
  }
  const mediaEvents = {
    onLoadedMetadata: updateDuration,
    onDurationChange: updateDuration,
    onLoadedData: () => setHasFrame(true),
    onSeeking: () => setHasFrame(false),
    onSeeked: (event: SyntheticEvent<HTMLVideoElement>) => setHasFrame(event.currentTarget.readyState >= 2),
    onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => setTime(event.currentTarget.currentTime),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onEnded: () => setPlaying(false),
    onEmptied: () => {
      setDuration(null);
      setHasFrame(false);
      setPlaying(false);
    },
    onError: () => {
      setHasFrame(false);
      setPlaying(false);
      setError('Запись недоступна или её кодек не поддерживается браузером.');
    },
  };
  return { video, time, duration, playing, hasFrame, error, seek, play, retry, mediaEvents };
}
