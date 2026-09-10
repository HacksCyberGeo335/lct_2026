package main

import (
	"log"

	"api_gateway/internal/config"
	"api_gateway/internal/server"
)

func main() {
	log.SetFlags(0)

	cfg := config.Load()

	srv, err := server.New(cfg)
	if err != nil {
		log.Fatalf("failed to create server: %v", err)
	}

	log.Printf("api_gateway listening on %s", cfg.Address)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("api_gateway stopped: %v", err)
	}
}
