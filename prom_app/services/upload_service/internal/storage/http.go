package storage

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

var ErrNotFound = errors.New("not found")

type HTTPClient struct {
	endpoint string
	client   *http.Client
}

type ObjectMetadata struct {
	ContentLength int64
	ContentType   string
	ETag          string
}

func NewHTTPClient(endpoint string) *HTTPClient {
	return &HTTPClient{
		endpoint: strings.TrimRight(endpoint, "/"),
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *HTTPClient) HeadObject(ctx context.Context, bucket string, objectKey string) (ObjectMetadata, error) {
	objectURL, err := url.JoinPath(c.endpoint, bucket, path.Clean(objectKey))
	if err != nil {
		return ObjectMetadata{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, objectURL, nil)
	if err != nil {
		return ObjectMetadata{}, err
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return ObjectMetadata{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return ObjectMetadata{}, ErrNotFound
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ObjectMetadata{}, errors.New(resp.Status)
	}

	return ObjectMetadata{
		ContentLength: resp.ContentLength,
		ContentType:   resp.Header.Get("Content-Type"),
		ETag:          strings.Trim(resp.Header.Get("ETag"), `"`),
	}, nil
}
