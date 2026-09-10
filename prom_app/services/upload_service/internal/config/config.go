package config

import (
	"os"
	"time"
)

type Config struct {
	Address               string
	DatabaseURL           string
	MinIOInternalEndpoint string
	MinIOPublicEndpoint   string
	OriginalsBucket       string
	ReadTimeout           time.Duration
	WriteTimeout          time.Duration
	IdleTimeout           time.Duration
}

func Load() Config {
	return Config{
		Address:               getEnv("UPLOAD_SERVICE_ADDRESS", ":8081"),
		DatabaseURL:           getEnv("DATABASE_URL", "postgres://prom_app:prom_app_password@localhost:5432/prom_app?sslmode=disable"),
		MinIOInternalEndpoint: trimTrailingSlash(getEnv("MINIO_INTERNAL_ENDPOINT", "http://localhost:9000")),
		MinIOPublicEndpoint:   trimTrailingSlash(getEnv("MINIO_PUBLIC_ENDPOINT", "http://localhost:9000")),
		OriginalsBucket:       getEnv("MINIO_ORIGINALS_BUCKET", "video-originals-prom"),
		ReadTimeout:           10 * time.Second,
		WriteTimeout:          30 * time.Second,
		IdleTimeout:           60 * time.Second,
	}
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func trimTrailingSlash(value string) string {
	for len(value) > 1 && value[len(value)-1] == '/' {
		value = value[:len(value)-1]
	}
	return value
}
