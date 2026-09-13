import { expect, it } from 'vitest';
import { parsePosition, formatPlaybackTime } from './usePlayback';
it('preserves zero and positions past a minute while rejecting invalid positions', () => {
  expect(parsePosition('0', 15)).toBe(0);
  expect(parsePosition('125.3', 0)).toBe(125.3);
  for (const value of [null, '', 'invalid', 'Infinity', '-5']) expect(parsePosition(value, 15)).toBe(15);
});
it('shows unknown duration without inventing a one-minute recording', () => {
  expect(formatPlaybackTime(null)).toBe('--:--');
  expect(formatPlaybackTime(Infinity)).toBe('--:--');
  expect(formatPlaybackTime(125.3)).toBe('02:05');
});
