import { z } from 'zod';
import { analysisResultSchema, type InspectionFrame } from '../domain/inspection';
import { planSchema } from '../domain/plan';
import { parseAnalysisResult } from './analysisResult';
const demoSchema = z.object({
  frames: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string().regex(/^\/inspection\/[a-z-]+\.png$/),
        sha256: z.string(),
        width: z.number(),
        height: z.number(),
        bytes: z.number(),
        origin: z.literal('demo'),
        result: analysisResultSchema,
      }),
    )
    .min(1)
    .max(50),
  plan: planSchema,
});
export async function loadInspectionDemo(signal: AbortSignal) {
  const response = await fetch('/inspection/manifest.json', { signal });
  if (!response.ok) throw new Error('Не удалось открыть демонстрационный набор снимков.');
  const parsed = demoSchema.parse(await response.json());
  for (const frame of parsed.frames) parseAnalysisResult(frame.result, frame as InspectionFrame);
  return parsed;
}
