package storage

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHeadObjectPreservesFileName(t *testing.T) {
	for _, name := range []string{"фото 1.png", "photo%20one.jpg", "100%.png", "photo#1?.jpg"} {
		t.Run(name, func(t *testing.T) {
			expected := "/originals/id/" + name
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != expected {
					t.Errorf("path = %q, want %q", r.URL.Path, expected)
				}
				w.Header().Set("Content-Length", "10")
			}))
			defer server.Close()
			if _, err := NewHTTPClient(server.URL).HeadObject(context.Background(), "originals", "id/"+name); err != nil {
				t.Fatal(err)
			}
		})
	}
}
