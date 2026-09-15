package controller

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// A seekable body answers byte ranges, which is what lets a <video> seek
// without downloading the whole attachment first.
func TestWriteFileBody_SeekableAnswersRanges(t *testing.T) {
	payload := []byte("0123456789abcdef")

	t.Run("full body", func(t *testing.T) {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/f", nil)
		if err := writeFileBody(w, r, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if w.Code != http.StatusOK || w.Body.String() != string(payload) {
			t.Fatalf("got %d %q", w.Code, w.Body.String())
		}
		if w.Header().Get("Accept-Ranges") != "bytes" {
			t.Fatalf("expected Accept-Ranges: bytes, got %q", w.Header().Get("Accept-Ranges"))
		}
	})

	t.Run("byte range", func(t *testing.T) {
		w := httptest.NewRecorder()
		r := httptest.NewRequest(http.MethodGet, "/f", nil)
		r.Header.Set("Range", "bytes=4-7")
		if err := writeFileBody(w, r, bytes.NewReader(payload), int64(len(payload))); err != nil {
			t.Fatal(err)
		}
		if w.Code != http.StatusPartialContent || w.Body.String() != "4567" {
			t.Fatalf("got %d %q", w.Code, w.Body.String())
		}
		if got := w.Header().Get("Content-Range"); got != "bytes 4-7/16" {
			t.Fatalf("Content-Range = %q", got)
		}
	})
}

// A body that cannot seek is streamed whole with its length, as before.
func TestWriteFileBody_NonSeekableStreamsWhole(t *testing.T) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/f", nil)
	r.Header.Set("Range", "bytes=0-1")
	body := io.NopCloser(strings.NewReader("hello"))
	if err := writeFileBody(w, r, body, 5); err != nil {
		t.Fatal(err)
	}
	if w.Code != http.StatusOK || w.Body.String() != "hello" {
		t.Fatalf("got %d %q", w.Code, w.Body.String())
	}
	if w.Header().Get("Content-Length") != "5" {
		t.Fatalf("Content-Length = %q", w.Header().Get("Content-Length"))
	}
}
