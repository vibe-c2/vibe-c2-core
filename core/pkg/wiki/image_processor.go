package wiki

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"

	"github.com/gabriel-vasile/mimetype"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // decode-only: registers WebP with image.Decode
)

// Supported MIME types for wiki image uploads.
const (
	MimeJPEG = "image/jpeg"
	MimePNG  = "image/png"
	MimeWebP = "image/webp"
	MimeGIF  = "image/gif"
	MimeAVIF = "image/avif"
	MimeSVG  = "image/svg+xml"
)

// ErrUnsupportedImageType is returned when the detected MIME type is not in
// the allowlist. The caller should surface this as a 415.
var ErrUnsupportedImageType = errors.New("unsupported image type")

// ErrInvalidImage is returned when bytes claim to be an image but fail to
// decode. Surface as 400.
var ErrInvalidImage = errors.New("invalid image")

// ProcessedImage is the output of ProcessImage — ready to be stored verbatim.
type ProcessedImage struct {
	Bytes       []byte
	ContentType string // canonical MIME type after processing (may differ from input if re-encoded)
	Width       int    // 0 if dimensions could not be determined (e.g. AVIF)
	Height      int
	Checksum    string // sha256 of Bytes, hex-encoded
}

// ImageProcessor validates, sanitizes, and optionally downscales image
// uploads before they hit the object store.
type ImageProcessor struct {
	maxDimension int // pixels on the long edge; 0 disables downscaling
}

func NewImageProcessor(maxDimension int) *ImageProcessor {
	return &ImageProcessor{maxDimension: maxDimension}
}

// ProcessImage inspects input, rejects unsupported types, strips EXIF for
// raster formats by re-encoding, sanitizes SVG, and downscales raster images
// whose long edge exceeds maxDimension. Returns bytes ready for storage.
func (p *ImageProcessor) ProcessImage(input []byte) (ProcessedImage, error) {
	mt := mimetype.Detect(input)
	detected := mt.String()

	switch detected {
	case MimeJPEG, MimePNG:
		return p.processRaster(input, detected)
	case MimeWebP:
		return p.processWebP(input)
	case MimeGIF:
		return p.processGIF(input)
	case MimeAVIF:
		return p.processAVIF(input)
	case MimeSVG:
		return p.processSVG(input)
	default:
		// mimetype reports e.g. "image/svg+xml; charset=utf-8" — normalize.
		if mt.Is(MimeSVG) {
			return p.processSVG(input)
		}
		return ProcessedImage{}, fmt.Errorf("%w: %s", ErrUnsupportedImageType, detected)
	}
}

// processRaster handles JPEG and PNG: decode, downscale if needed, re-encode
// (which also strips EXIF because stdlib encoders don't emit it).
func (p *ImageProcessor) processRaster(input []byte, mime string) (ProcessedImage, error) {
	img, _, err := image.Decode(bytes.NewReader(input))
	if err != nil {
		return ProcessedImage{}, fmt.Errorf("%w: %v", ErrInvalidImage, err)
	}

	scaled := p.maybeDownscale(img)

	var buf bytes.Buffer
	switch mime {
	case MimeJPEG:
		if err := jpeg.Encode(&buf, scaled, &jpeg.Options{Quality: 85}); err != nil {
			return ProcessedImage{}, fmt.Errorf("jpeg encode: %w", err)
		}
	case MimePNG:
		if err := png.Encode(&buf, scaled); err != nil {
			return ProcessedImage{}, fmt.Errorf("png encode: %w", err)
		}
	}

	b := buf.Bytes()
	bounds := scaled.Bounds()
	return ProcessedImage{
		Bytes:       b,
		ContentType: mime,
		Width:       bounds.Dx(),
		Height:      bounds.Dy(),
		Checksum:    checksum(b),
	}, nil
}

// processWebP decodes WebP for validation and dimensions. No pure-Go WebP
// encoder is readily available, so if downscaling is needed we re-encode as
// PNG (lossless — acceptable size hit for the rare oversized upload).
// Otherwise the original bytes pass through.
func (p *ImageProcessor) processWebP(input []byte) (ProcessedImage, error) {
	img, _, err := image.Decode(bytes.NewReader(input))
	if err != nil {
		return ProcessedImage{}, fmt.Errorf("%w: %v", ErrInvalidImage, err)
	}

	bounds := img.Bounds()
	if !p.needsDownscale(bounds) {
		return ProcessedImage{
			Bytes:       input,
			ContentType: MimeWebP,
			Width:       bounds.Dx(),
			Height:      bounds.Dy(),
			Checksum:    checksum(input),
		}, nil
	}

	scaled := p.maybeDownscale(img)
	var buf bytes.Buffer
	if err := png.Encode(&buf, scaled); err != nil {
		return ProcessedImage{}, fmt.Errorf("png encode (webp fallback): %w", err)
	}
	b := buf.Bytes()
	out := scaled.Bounds()
	return ProcessedImage{
		Bytes:       b,
		ContentType: MimePNG,
		Width:       out.Dx(),
		Height:      out.Dy(),
		Checksum:    checksum(b),
	}, nil
}

// processGIF preserves animation by passing bytes through. We decode only
// enough to validate the file and record dimensions from the first frame.
// Downscaling animated GIFs frame-by-frame is intentionally out of scope.
func (p *ImageProcessor) processGIF(input []byte) (ProcessedImage, error) {
	cfg, err := gif.DecodeConfig(bytes.NewReader(input))
	if err != nil {
		return ProcessedImage{}, fmt.Errorf("%w: %v", ErrInvalidImage, err)
	}
	return ProcessedImage{
		Bytes:       input,
		ContentType: MimeGIF,
		Width:       cfg.Width,
		Height:      cfg.Height,
		Checksum:    checksum(input),
	}, nil
}

// processAVIF passes AVIF through unchanged. Pure-Go AVIF decoders are
// immature, so we accept the file based on magic-byte detection alone and
// leave Width/Height at 0. Size limits are enforced by the caller.
func (p *ImageProcessor) processAVIF(input []byte) (ProcessedImage, error) {
	return ProcessedImage{
		Bytes:       input,
		ContentType: MimeAVIF,
		Checksum:    checksum(input),
	}, nil
}

// processSVG parses and sanitizes SVG via an XML allowlist. See svg.go.
func (p *ImageProcessor) processSVG(input []byte) (ProcessedImage, error) {
	sanitized, width, height, err := SanitizeSVG(input)
	if err != nil {
		return ProcessedImage{}, fmt.Errorf("%w: %v", ErrInvalidImage, err)
	}
	return ProcessedImage{
		Bytes:       sanitized,
		ContentType: MimeSVG,
		Width:       width,
		Height:      height,
		Checksum:    checksum(sanitized),
	}, nil
}

func (p *ImageProcessor) needsDownscale(b image.Rectangle) bool {
	if p.maxDimension <= 0 {
		return false
	}
	return b.Dx() > p.maxDimension || b.Dy() > p.maxDimension
}

// maybeDownscale returns the source image scaled so the long edge matches
// maxDimension, preserving aspect ratio. Returns the original if no scaling
// is needed.
func (p *ImageProcessor) maybeDownscale(src image.Image) image.Image {
	if !p.needsDownscale(src.Bounds()) {
		return src
	}
	srcBounds := src.Bounds()
	srcW, srcH := srcBounds.Dx(), srcBounds.Dy()

	var dstW, dstH int
	if srcW >= srcH {
		dstW = p.maxDimension
		dstH = int(float64(srcH) * float64(p.maxDimension) / float64(srcW))
	} else {
		dstH = p.maxDimension
		dstW = int(float64(srcW) * float64(p.maxDimension) / float64(srcH))
	}

	dst := image.NewRGBA(image.Rect(0, 0, dstW, dstH))
	// CatmullRom gives the best quality-for-effort for downscaling photos.
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, srcBounds, draw.Over, nil)
	return dst
}

func checksum(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// ReadAllLimited reads up to max+1 bytes from r, returning an error if more
// than max bytes are available. Callers use this to enforce upload size caps
// before feeding bytes to ProcessImage.
func ReadAllLimited(r io.Reader, max int64) ([]byte, error) {
	limited := &io.LimitedReader{R: r, N: max + 1}
	b, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(b)) > max {
		return nil, fmt.Errorf("image exceeds maximum size of %d bytes", max)
	}
	return b, nil
}
