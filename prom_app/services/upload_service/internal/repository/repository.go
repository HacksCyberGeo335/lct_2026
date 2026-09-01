package repository

import (
	"context"
	"database/sql"
	"errors"

	_ "github.com/jackc/pgx/v5/stdlib"
)

var ErrNotFound = errors.New("not found")

type Repository struct {
	db *sql.DB
}

type CreateVideoParams struct {
	UUID       string
	VideoName  string
	StorageKey string
	SizeBytes  int64
}

type ReadyVideoParams struct {
	UUID        string
	SizeBytes   int64
	ContentType string
	ETag        string
}

type Video struct {
	UUID       string
	VideoName  string
	StorageKey string
	Status     string
}

func New(ctx context.Context, databaseURL string) (*Repository, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}

	if err := ensureCompatibleSchema(ctx, db); err != nil {
		_ = db.Close()
		return nil, err
	}

	return &Repository{db: db}, nil
}

func (r *Repository) Close() {
	_ = r.db.Close()
}

func (r *Repository) CreateUploadingVideo(ctx context.Context, params CreateVideoParams) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO general_video_table (
			uuid,
			video_name,
			storage_key,
			status,
			original_size_bytes
		)
		VALUES ($1, $2, $3, 'UPLOADING', $4)
	`, params.UUID, params.VideoName, params.StorageKey, params.SizeBytes)
	return err
}

func (r *Repository) GetVideo(ctx context.Context, uuid string) (Video, error) {
	var video Video
	err := r.db.QueryRowContext(ctx, `
		SELECT uuid, video_name, storage_key, status
		FROM general_video_table
		WHERE uuid = $1
	`, uuid).Scan(&video.UUID, &video.VideoName, &video.StorageKey, &video.Status)
	if errors.Is(err, sql.ErrNoRows) {
		return Video{}, ErrNotFound
	}
	return video, err
}

func (r *Repository) MarkVideoReady(ctx context.Context, params ReadyVideoParams) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE general_video_table
		SET
			status = 'READY',
			original_size_bytes = $2,
			original_content_type = $3,
			original_etag = $4
		WHERE uuid = $1
	`, params.UUID, params.SizeBytes, params.ContentType, params.ETag)
	return err
}

func ensureCompatibleSchema(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
		ALTER TABLE general_video_table
			ADD COLUMN IF NOT EXISTS original_size_bytes BIGINT,
			ADD COLUMN IF NOT EXISTS original_content_type TEXT,
			ADD COLUMN IF NOT EXISTS original_etag TEXT
	`)
	return err
}
