package middleware

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"
)

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, HEAD, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func AccessLog(service string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &responseRecorder{
			ResponseWriter: w,
			statusCode:     http.StatusOK,
		}

		next.ServeHTTP(recorder, r)

		duration := time.Since(start)
		level := "info"
		if recorder.statusCode >= 500 {
			level = "error"
		} else if recorder.statusCode >= 400 {
			level = "warn"
		}

		entry := map[string]any{
			"log_type":         "http_access",
			"level":            level,
			"service":          service,
			"method":           r.Method,
			"endpoint":         normalizeEndpoint(r.URL.Path),
			"path":             r.URL.Path,
			"status":           recorder.statusCode,
			"duration_seconds": duration.Seconds(),
			"duration_ms":      float64(duration.Microseconds()) / 1000,
			"remote_addr":      r.RemoteAddr,
			"user_agent":       r.UserAgent(),
		}
		if recorder.statusCode >= 400 && recorder.body != "" {
			entry["error"] = strings.TrimSpace(recorder.body)
		}

		payload, err := json.Marshal(entry)
		if err != nil {
			log.Printf(`{"log_type":"http_access","level":"error","service":%q,"error":"failed to marshal access log"}`, service)
			return
		}
		log.Print(string(payload))
	})
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode  int
	body        string
	wroteHeader bool
}

func (r *responseRecorder) WriteHeader(statusCode int) {
	if r.wroteHeader {
		return
	}
	r.wroteHeader = true
	r.statusCode = statusCode
	r.ResponseWriter.WriteHeader(statusCode)
}

func (r *responseRecorder) Write(body []byte) (int, error) {
	if r.statusCode >= 400 && len(r.body) < 512 {
		remaining := 512 - len(r.body)
		if len(body) < remaining {
			remaining = len(body)
		}
		r.body += string(body[:remaining])
	}
	return r.ResponseWriter.Write(body)
}

func normalizeEndpoint(path string) string {
	if strings.HasPrefix(path, "/api/videos/") && strings.HasSuffix(path, "/upload-complete") {
		return "/api/videos/{uuid}/upload-complete"
	}
	return path
}
