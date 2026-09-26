import { useEffect, useRef, useState } from 'react';

/** Serializes file operations and prevents late results from updating a discarded workspace. */
export function useFileOperation(disabled = false, onBusyChange?: (busy: boolean) => void) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const version = useRef(0),
    working = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      version.current++;
      working.current = false;
      controller.current?.abort();
      onBusyChange?.(false);
    },
    [onBusyChange],
  );

  async function run(operation: (current: number, signal: AbortSignal) => Promise<void>) {
    if (working.current || disabled) return;
    working.current = true;
    const current = ++version.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    setMessage('');
    try {
      await operation(current, abort.signal);
    } catch (e) {
      if (current === version.current)
        setError(e instanceof Error ? e.message : 'Не удалось завершить действие.');
    } finally {
      if (current === version.current) {
        controller.current = null;
        working.current = false;
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  }
  return { busy, error, message, setMessage, version, run };
}
