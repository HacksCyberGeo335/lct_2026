package router

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"api_gateway/internal/handler"
	"api_gateway/internal/middleware"
)

func New(uploadServiceURL string) (http.Handler, error) {
	target, err := url.Parse(uploadServiceURL)
	if err != nil {
		return nil, err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handler.Health)
	mux.Handle("/api/videos/", reverseProxy(target))

	return middleware.CORS(middleware.AccessLog("api_gateway", mux)), nil
}

func reverseProxy(target *url.URL) http.Handler {
	proxy := httputil.NewSingleHostReverseProxy(target)
	defaultDirector := proxy.Director

	proxy.Director = func(r *http.Request) {
		defaultDirector(r)
		r.Host = target.Host
		r.URL.Path = singleJoiningSlash(target.Path, r.URL.Path)
	}

	return proxy
}

func singleJoiningSlash(a string, b string) string {
	aslash := strings.HasSuffix(a, "/")
	bslash := strings.HasPrefix(b, "/")
	switch {
	case aslash && bslash:
		return a + b[1:]
	case !aslash && !bslash:
		return a + "/" + b
	default:
		return a + b
	}
}
