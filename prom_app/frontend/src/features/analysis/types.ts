/** Frontend view model. Map the future backend response to this type in an API adapter. */
export type FileAnalysis = { fileId: string } & (
  | { status: 'unavailable' }
  | { status: 'queued' }
  | { status: 'processing' }
  | { status: 'completed'; text: string; model?: string }
  | { status: 'failed'; error: string }
);
