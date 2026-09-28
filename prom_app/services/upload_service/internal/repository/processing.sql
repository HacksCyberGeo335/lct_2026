CREATE TABLE IF NOT EXISTS processing_jobs (
    id BIGSERIAL PRIMARY KEY,
    media_uuid UUID NOT NULL REFERENCES general_video_table(uuid) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('yolo', 'vlm')),
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_until TIMESTAMPTZ,
    lease_token UUID,
    result JSONB,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (media_uuid, kind)
);
CREATE INDEX IF NOT EXISTS processing_jobs_pending ON processing_jobs(kind, status, available_at);
CREATE TABLE IF NOT EXISTS analysis_tasks (
    id BIGSERIAL PRIMARY KEY,
    media_uuid UUID NOT NULL UNIQUE REFERENCES general_video_table(uuid) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
