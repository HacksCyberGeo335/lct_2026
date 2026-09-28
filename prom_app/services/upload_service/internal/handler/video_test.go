package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"upload_service/internal/config"
	"upload_service/internal/repository"
	"upload_service/internal/storage"
)

type memoryRepo struct {
	video repository.Video
	ready bool
}

func (m *memoryRepo) CreateUploadingVideo(_ context.Context, p repository.CreateVideoParams) error {
	m.video = repository.Video{UUID: p.UUID, MediaType: p.MediaType, VideoName: p.VideoName, StorageKey: p.StorageKey}
	return nil
}
func (m *memoryRepo) GetVideo(context.Context, string) (repository.Video, error) { return m.video, nil }
func (m *memoryRepo) MarkVideoReady(context.Context, repository.ReadyVideoParams) error {
	m.ready = true
	return nil
}

func TestUploadLifecycle(t *testing.T) {
	for _, tc := range []struct {
		name, route, file, contentType string
		storageStatus, want            int
	}{
		{"jpg", "photos", "image.JPG", "image/jpeg", 200, 200},
		{"png", "photos", "image.png", "image/png", 200, 200},
		{"jpeg", "photos", "image.jpeg", "image/jpeg", 200, 200},
		{"wrong MIME", "photos", "image.jpg", "image/gif", 200, 400},
		{"missing object", "photos", "image.png", "image/png", 404, 404},
		{"video regression", "videos", "video.mp4", "video/mp4", 200, 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s3 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodHead {
					t.Errorf("method = %s", r.Method)
				}
				if !strings.HasSuffix(r.URL.Path, "/"+tc.file) {
					t.Errorf("path = %s", r.URL.Path)
				}
				w.Header().Set("Content-Type", tc.contentType)
				w.Header().Set("Content-Length", "10")
				w.WriteHeader(tc.storageStatus)
			}))
			defer s3.Close()
			repo := &memoryRepo{}
			h := &VideoHandler{cfg: config.Config{OriginalsBucket: "originals", MinIOPublicEndpoint: s3.URL}, repo: repo, storage: storage.NewHTTPClient(s3.URL)}
			mux := http.NewServeMux()
			h.Routes(mux)
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest("POST", "/api/"+tc.route+"/init-upload", strings.NewReader(`{"file_name":"`+tc.file+`","size":10}`)))
			if response.Code != 200 {
				t.Fatalf("init: %d %s", response.Code, response.Body)
			}
			var data initUploadResponse
			if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil {
				t.Fatal(err)
			}
			if data.UUID == "" || data.StorageKey != "originals/"+data.UUID+"/"+tc.file {
				t.Fatalf("invalid response: %+v", data)
			}
			response = httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest("POST", "/api/"+tc.route+"/"+data.UUID+"/upload-complete", nil))
			if response.Code != tc.want || repo.ready != (tc.want == 200) {
				t.Fatalf("complete: %d, ready: %v", response.Code, repo.ready)
			}
			if tc.route == "photos" {
				response = httptest.NewRecorder()
				mux.ServeHTTP(response, httptest.NewRequest("POST", "/api/videos/"+data.UUID+"/upload-complete", nil))
				if response.Code != 404 {
					t.Fatalf("wrong media route: %d", response.Code)
				}
			}
		})
	}
}
func TestRejectInvalidPhotos(t *testing.T) {
	for _, body := range []string{`{"file_name":"x.gif","size":1}`, `{"file_name":"x.mp4","size":1}`, `{"file_name":"x.png","size":0}`, `{"file_name":"","size":1}`, `invalid`} {
		h := &VideoHandler{}
		response := httptest.NewRecorder()
		h.InitUpload(response, httptest.NewRequest("POST", "/api/photos/init-upload", strings.NewReader(body)))
		if response.Code != 400 {
			t.Fatalf("body %s: %d", body, response.Code)
		}
	}
}
