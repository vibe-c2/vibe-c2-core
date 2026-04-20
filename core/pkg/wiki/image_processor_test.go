package wiki

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

func TestProcessImage_PNG_StripsAndPasses(t *testing.T) {
	p := NewImageProcessor(2560)
	src := solidPNG(t, 100, 80, color.RGBA{R: 10, G: 20, B: 30, A: 255})

	got, err := p.ProcessImage(src)
	if err != nil {
		t.Fatalf("ProcessImage: %v", err)
	}
	if got.ContentType != MimePNG {
		t.Fatalf("content-type: got %q want %q", got.ContentType, MimePNG)
	}
	if got.Width != 100 || got.Height != 80 {
		t.Fatalf("dims: got %dx%d want 100x80", got.Width, got.Height)
	}
	if got.Checksum == "" {
		t.Fatal("checksum missing")
	}
	// Confirm the output still decodes as PNG.
	if _, err := png.Decode(bytes.NewReader(got.Bytes)); err != nil {
		t.Fatalf("output not valid PNG: %v", err)
	}
}

func TestProcessImage_JPEG_Downscales(t *testing.T) {
	p := NewImageProcessor(500)
	src := solidJPEG(t, 1600, 900)

	got, err := p.ProcessImage(src)
	if err != nil {
		t.Fatalf("ProcessImage: %v", err)
	}
	if got.Width != 500 {
		t.Fatalf("expected long edge 500, got width %d", got.Width)
	}
	// Aspect ratio preserved — 1600:900 → ~281 for the short edge at 500.
	if got.Height < 270 || got.Height > 290 {
		t.Fatalf("expected height near 281, got %d", got.Height)
	}
	// Re-decode to ensure valid output.
	img, err := jpeg.Decode(bytes.NewReader(got.Bytes))
	if err != nil {
		t.Fatalf("output not valid JPEG: %v", err)
	}
	if img.Bounds().Dx() != 500 {
		t.Fatalf("decoded width mismatch: %d", img.Bounds().Dx())
	}
}

func TestProcessImage_GIF_PassesThrough(t *testing.T) {
	p := NewImageProcessor(2560)
	src := solidGIF(t, 50, 40)

	got, err := p.ProcessImage(src)
	if err != nil {
		t.Fatalf("ProcessImage: %v", err)
	}
	if got.ContentType != MimeGIF {
		t.Fatalf("content-type: got %q", got.ContentType)
	}
	if got.Width != 50 || got.Height != 40 {
		t.Fatalf("dims: got %dx%d", got.Width, got.Height)
	}
	if !bytes.Equal(got.Bytes, src) {
		t.Fatal("GIF bytes should pass through unchanged")
	}
}

func TestProcessImage_Rejects_NonImage(t *testing.T) {
	p := NewImageProcessor(2560)
	_, err := p.ProcessImage([]byte("this is not an image"))
	if err == nil {
		t.Fatal("expected error for non-image input")
	}
}

func TestProcessImage_Rejects_Executable(t *testing.T) {
	p := NewImageProcessor(2560)
	// Windows PE header.
	pe := append([]byte("MZ"), bytes.Repeat([]byte{0}, 256)...)
	_, err := p.ProcessImage(pe)
	if err == nil {
		t.Fatal("expected executable to be rejected")
	}
}

func TestSanitizeSVG_StripsScript(t *testing.T) {
	input := []byte(`<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
  <rect width="100" height="100" fill="red"/>
  <script>alert('xss')</script>
  <g onclick="alert(1)"><circle cx="50" cy="50" r="40"/></g>
</svg>`)

	out, w, h, err := SanitizeSVG(input)
	if err != nil {
		t.Fatalf("SanitizeSVG: %v", err)
	}
	s := string(out)
	if strings.Contains(s, "<script") || strings.Contains(s, "alert") {
		t.Fatalf("script not stripped:\n%s", s)
	}
	if strings.Contains(s, "onclick") {
		t.Fatalf("onclick not stripped:\n%s", s)
	}
	if w != 100 || h != 100 {
		t.Fatalf("dims: got %dx%d want 100x100", w, h)
	}
}

func TestSanitizeSVG_StripsForeignObject(t *testing.T) {
	input := []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></div></foreignObject>
  <rect width="10" height="10"/>
</svg>`)
	out, _, _, err := SanitizeSVG(input)
	if err != nil {
		t.Fatalf("SanitizeSVG: %v", err)
	}
	s := string(out)
	if strings.Contains(s, "foreignObject") || strings.Contains(s, "script") || strings.Contains(s, "div") {
		t.Fatalf("foreignObject subtree leaked:\n%s", s)
	}
	if !strings.Contains(s, "<rect") {
		t.Fatalf("expected rect to survive:\n%s", s)
	}
}

func TestSanitizeSVG_BlocksJavascriptHref(t *testing.T) {
	input := []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <a xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="javascript:alert(1)"><rect width="10" height="10"/></a>
</svg>`)
	out, _, _, err := SanitizeSVG(input)
	if err != nil {
		t.Fatalf("SanitizeSVG: %v", err)
	}
	if strings.Contains(string(out), "javascript") {
		t.Fatalf("javascript: href leaked:\n%s", out)
	}
}

func TestSanitizeSVG_RejectsNonSVGRoot(t *testing.T) {
	_, _, _, err := SanitizeSVG([]byte(`<html><body>evil</body></html>`))
	if err == nil {
		t.Fatal("expected error for non-SVG root")
	}
}

func TestSanitizeSVG_BillionLaughsRejected(t *testing.T) {
	// External entity should be rejected because decoder has empty entity map.
	input := []byte(`<?xml version="1.0"?>
<!DOCTYPE svg [<!ENTITY lol "LOL">]>
<svg xmlns="http://www.w3.org/2000/svg">
  <text>&lol;</text>
</svg>`)
	_, _, _, err := SanitizeSVG(input)
	if err == nil {
		t.Fatal("expected entity expansion to fail")
	}
}

func TestReadAllLimited(t *testing.T) {
	_, err := ReadAllLimited(bytes.NewReader([]byte("abc")), 2)
	if err == nil {
		t.Fatal("expected size limit error")
	}
	b, err := ReadAllLimited(bytes.NewReader([]byte("abc")), 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(b) != "abc" {
		t.Fatalf("got %q", string(b))
	}
}

// --- helpers ---

func solidPNG(t *testing.T, w, h int, c color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func solidJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func solidGIF(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewPaletted(image.Rect(0, 0, w, h), []color.Color{color.Black, color.White})
	var buf bytes.Buffer
	if err := gif.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}
