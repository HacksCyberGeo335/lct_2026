package main

import (
	"context"
	"log"

	"upload_service/internal/config"
	"upload_service/internal/repository"
	"upload_service/internal/server"
	"upload_service/internal/storage"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	repo, err := repository.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect postgres: %v", err)
	}
	defer repo.Close()

	minioClient := storage.NewHTTPClient(cfg.MinIOInternalEndpoint)

	srv := server.New(cfg, repo, minioClient)
	log.Printf("upload_service listening on %s", cfg.Address)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("upload_service stopped: %v", err)
	}
}
