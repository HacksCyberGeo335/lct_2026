package config

import (
	"os"
	"time"
)

type Config struct {
	Address          string
	UploadServiceURL string
	ReadTimeout      time.Duration
	WriteTimeout     time.Duration
	IdleTimeout      time.Duration
}

func Load() Config {
	return Config{
		Address:          getEnv("API_GATEWAY_ADDRESS", ":8080"),
		UploadServiceURL: getEnv("UPLOAD_SERVICE_URL", "http://localhost:8081"),
		ReadTimeout:      10 * time.Second,
		WriteTimeout:     30 * time.Second,
		IdleTimeout:      60 * time.Second,
	}
}

func getEnv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
