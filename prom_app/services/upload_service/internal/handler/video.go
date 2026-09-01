package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"
	"strconv"
	"strings"

	"upload_service/internal/config"
	"upload_service/internal/repository"
	"upload_service/internal/storage"
)

type VideoHandler struct {
	cfg     config.Config
	repo    *repository.Repository
	storage *storage.HTTPClient
}

type initUploadRequest struct {
	FileName string `json:"file_name"`
	Size     int64  `json:"size"`
}

type initUploadResponse struct {
	UUID       string `json:"uuid"`
	UploadURL  string `json:"upload_url"`
	StorageKey string `json:"storage_key"`
}

func NewVideoHandler(cfg config.Config, repo *repository.Repository, storageClient *storage.HTTPClient) *VideoHandler {
	return &VideoHandler{cfg: cfg, repo: repo, storage: storageClient}
}

func (h *VideoHandler) Routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/videos/init-upload", h.InitUpload)
	mux.HandleFunc("/api/videos/", h.VideoAction)
}

func (h *VideoHandler) InitUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req initUploadRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json body", http.StatusBadRequest)
		return
	}

	req.FileName = strings.TrimSpace(req.FileName)
	if req.FileName == "" {
		http.Error(w, "file_name is required", http.StatusBadRequest)
		return
	}
	if req.Size <= 0 {
		http.Error(w, "size must be greater than zero", http.StatusBadRequest)
		return
	}

	uuid, err := newUUID()
	if err != nil {
		http.Error(w, "failed to generate uuid", http.StatusInternalServerError)
		return
	}

	objectName := path.Base(req.FileName)
	storageKey := path.Join(h.cfg.OriginalsBucket, uuid, objectName)
	if err := h.repo.CreateUploadingVideo(r.Context(), repository.CreateVideoParams{
		UUID:       uuid,
		VideoName:  objectName,
		StorageKey: storageKey,
		SizeBytes:  req.Size,
	}); err != nil {
		http.Error(w, "failed to create video row", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, initUploadResponse{
		UUID:       uuid,
		UploadURL:  fmt.Sprintf("%s/%s", h.cfg.MinIOPublicEndpoint, h.cfg.OriginalsBucket),
		StorageKey: storageKey,
	})
}

func (h *VideoHandler) VideoAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	uuid, action, ok := parseVideoAction(r.URL.Path)
	if !ok || action != "upload-complete" {
		http.NotFound(w, r)
		return
	}

	video, err := h.repo.GetVideo(r.Context(), uuid)
	if errors.Is(err, repository.ErrNotFound) {
		http.Error(w, "video not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "failed to load video", http.StatusInternalServerError)
		return
	}

	objectKey := strings.TrimPrefix(video.StorageKey, h.cfg.OriginalsBucket+"/")
	meta, err := h.storage.HeadObject(r.Context(), h.cfg.OriginalsBucket, objectKey)
	if errors.Is(err, storage.ErrNotFound) {
		http.Error(w, "uploaded file not found in storage", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "failed to verify uploaded file", http.StatusBadGateway)
		return
	}

	if err := h.repo.MarkVideoReady(r.Context(), repository.ReadyVideoParams{
		UUID:        uuid,
		SizeBytes:   meta.ContentLength,
		ContentType: meta.ContentType,
		ETag:        meta.ETag,
	}); err != nil {
		http.Error(w, "failed to update video status", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func parseVideoAction(urlPath string) (string, string, bool) {
	const prefix = "/api/videos/"
	if !strings.HasPrefix(urlPath, prefix) {
		return "", "", false
	}

	parts := strings.Split(strings.TrimPrefix(urlPath, prefix), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

func writeJSON(w http.ResponseWriter, statusCode int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(value)
}

func newUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}

	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80

	encoded := hex.EncodeToString(b[:])
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:32], nil
}

func ParseContentLength(value string) int64 {
	contentLength, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0
	}
	return contentLength
}
