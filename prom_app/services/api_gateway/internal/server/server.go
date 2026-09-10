package server

import (
	"net/http"

	"api_gateway/internal/config"
	"api_gateway/internal/router"
)

func New(cfg config.Config) (*http.Server, error) {
	handler, err := router.New(cfg.UploadServiceURL)
	if err != nil {
		return nil, err
	}

	return &http.Server{
		Addr:         cfg.Address,
		Handler:      handler,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}, nil
}
