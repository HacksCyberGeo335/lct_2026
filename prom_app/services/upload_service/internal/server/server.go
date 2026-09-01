package server

import (
	"net/http"

	"upload_service/internal/config"
	"upload_service/internal/handler"
	"upload_service/internal/repository"
	"upload_service/internal/storage"
)

func New(cfg config.Config, repo *repository.Repository, storageClient *storage.HTTPClient) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", health)
	handler.NewVideoHandler(cfg, repo, storageClient).Routes(mux)

	return &http.Server{
		Addr:         cfg.Address,
		Handler:      mux,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}
}

func health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}
