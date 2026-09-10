CREATE TABLE IF NOT EXISTS general_video_table (
    uuid UUID PRIMARY KEY,
    video_name TEXT,
    storage_key TEXT,
    status TEXT,
    original_size_bytes BIGINT,
    original_content_type TEXT,
    original_etag TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meta_video_table (
    uuid UUID PRIMARY KEY REFERENCES general_video_table(uuid) ON DELETE CASCADE,
    width INTEGER,
    height INTEGER,
    fps NUMERIC(10, 3),
    duration_ms BIGINT,
    video_codec TEXT,
    audio_codec TEXT,
    bitrate BIGINT
);

CREATE INDEX IF NOT EXISTS idx_general_video_table_status
    ON general_video_table(status);

CREATE INDEX IF NOT EXISTS idx_general_video_table_created_at
    ON general_video_table(created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_general_video_table_updated_at ON general_video_table;

CREATE TRIGGER trg_general_video_table_updated_at
BEFORE UPDATE ON general_video_table
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
