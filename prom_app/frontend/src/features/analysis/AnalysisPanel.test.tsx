import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AnalysisPanel } from './AnalysisPanel';
afterEach(cleanup);
it('never reuses another file response after switching the selected file', () => {
  const analysis = { fileId: 'first', status: 'completed' as const, text: 'Result for first file' };
  const { rerender } = render(<AnalysisPanel fileId="first" fileName="first.png" analysis={analysis} />);
  expect(screen.queryByText(analysis.text)).not.toBeNull();
  rerender(<AnalysisPanel fileId="second" fileName="second.mp4" analysis={analysis} />);
  expect(screen.queryByText(analysis.text)).toBeNull();
  expect(screen.queryByText('Анализ пока недоступен')).not.toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});
it('renders model output as text rather than executing model-provided HTML', () => {
  const text = '<img src=x onerror="alert(1)">\n<script>alert(1)</script>';
  const { container } = render(
    <AnalysisPanel
      fileId="first"
      fileName="first.png"
      analysis={{ fileId: 'first', status: 'completed', text }}
    />,
  );
  expect(container.querySelector('.analysis-text')?.textContent).toBe(text);
  expect(container.querySelector('img, script')).toBeNull();
});
