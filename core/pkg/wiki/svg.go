package wiki

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

// svgAllowedElements is the allowlist of local element names permitted in
// sanitized SVG output. Namespaces other than SVG (e.g. XHTML inside a
// <foreignObject>) are stripped entirely.
var svgAllowedElements = map[string]bool{
	"svg":            true,
	"g":              true,
	"path":           true,
	"rect":           true,
	"circle":         true,
	"ellipse":        true,
	"line":           true,
	"polyline":       true,
	"polygon":        true,
	"text":           true,
	"tspan":          true,
	"textPath":       true,
	"defs":           true,
	"use":            true,
	"symbol":         true,
	"linearGradient": true,
	"radialGradient": true,
	"stop":           true,
	"pattern":        true,
	"title":          true,
	"desc":           true,
	"clipPath":       true,
	"mask":           true,
	"marker":         true,
	"filter":         true,
	// Filter primitives — usually safe, don't permit script-like sources.
	"feGaussianBlur":  true,
	"feOffset":        true,
	"feMerge":         true,
	"feMergeNode":     true,
	"feColorMatrix":   true,
	"feBlend":         true,
	"feFlood":         true,
	"feComposite":     true,
	"feMorphology":    true,
	"feTurbulence":    true,
	"feDisplacementMap": true,
}

// svgHrefAttrs are attributes that carry URIs — they must be scrubbed for
// javascript:, data:, and cross-origin references.
var svgHrefAttrs = map[string]bool{
	"href":       true,
	"xlink:href": true,
}

// SanitizeSVG parses an SVG payload, strips dangerous elements/attributes,
// and returns safe bytes plus the intrinsic dimensions (from width/height or
// viewBox). Rejects input that is not SVG at its root.
func SanitizeSVG(input []byte) (cleaned []byte, width int, height int, err error) {
	decoder := xml.NewDecoder(bytes.NewReader(input))
	// Disable external entities: SVG doesn't need DTDs and allowing them
	// enables billion-laughs / entity-smuggling attacks.
	decoder.Strict = true
	decoder.Entity = map[string]string{}

	var out bytes.Buffer
	encoder := xml.NewEncoder(&out)
	rootFound := false
	// Skip depth counts elements whose entire subtree we drop (disallowed or
	// namespaced). Tracking the skip depth on the stack of allowed elements
	// lets us match Start/End pairs correctly.
	skipDepth := 0

	for {
		tok, tokErr := decoder.Token()
		if tokErr == io.EOF {
			break
		}
		if tokErr != nil {
			return nil, 0, 0, fmt.Errorf("svg parse: %w", tokErr)
		}

		switch t := tok.(type) {
		case xml.ProcInst, xml.Directive, xml.Comment:
			// Drop processing instructions, DOCTYPEs, and comments — none are
			// needed for rendering and each is a potential attack vector.
			continue

		case xml.StartElement:
			if skipDepth > 0 {
				skipDepth++
				continue
			}

			localName := t.Name.Local
			if !rootFound {
				if localName != "svg" {
					return nil, 0, 0, errors.New("svg: root element must be <svg>")
				}
				rootFound = true
				width, height = extractSVGDimensions(t)
			}

			if !svgAllowedElements[localName] {
				skipDepth = 1
				continue
			}

			cleaned := scrubAttributes(t.Attr)
			// Normalize name namespace: preserve the local name only. This
			// drops any xmlns:foo="..." redirections that would otherwise
			// let an attacker re-enable filtered elements via namespace.
			t.Name = xml.Name{Local: localName}
			t.Attr = cleaned
			if err := encoder.EncodeToken(t); err != nil {
				return nil, 0, 0, fmt.Errorf("svg encode start: %w", err)
			}

		case xml.EndElement:
			if skipDepth > 0 {
				skipDepth--
				continue
			}
			t.Name = xml.Name{Local: t.Name.Local}
			if err := encoder.EncodeToken(t); err != nil {
				return nil, 0, 0, fmt.Errorf("svg encode end: %w", err)
			}

		case xml.CharData:
			if skipDepth > 0 {
				continue
			}
			if err := encoder.EncodeToken(t); err != nil {
				return nil, 0, 0, fmt.Errorf("svg encode chardata: %w", err)
			}
		}
	}

	if !rootFound {
		return nil, 0, 0, errors.New("svg: no <svg> root element found")
	}
	if err := encoder.Flush(); err != nil {
		return nil, 0, 0, fmt.Errorf("svg flush: %w", err)
	}

	return out.Bytes(), width, height, nil
}

// scrubAttributes filters the attribute list for an allowed element:
//   - drops any `on*` event handler
//   - drops `style` (CSS can load URLs and is a sniffing vector)
//   - sanitizes href/xlink:href (only allow same-document fragments)
//   - keeps everything else verbatim
func scrubAttributes(attrs []xml.Attr) []xml.Attr {
	out := make([]xml.Attr, 0, len(attrs))
	for _, a := range attrs {
		name := a.Name.Local
		lower := strings.ToLower(name)

		if strings.HasPrefix(lower, "on") {
			continue
		}
		if lower == "style" {
			continue
		}
		// Drop xmlns declarations whose prefix isn't the default or xlink —
		// this closes namespace-injection tricks.
		if a.Name.Space == "xmlns" && name != "xlink" {
			continue
		}

		qualified := name
		if a.Name.Space == "xlink" || (a.Name.Space == "" && lower == "xlink:href") {
			qualified = "xlink:href"
		}

		if svgHrefAttrs[qualified] || svgHrefAttrs[lower] {
			if !isSafeHref(a.Value) {
				continue
			}
		}

		out = append(out, xml.Attr{
			Name:  xml.Name{Local: name, Space: a.Name.Space},
			Value: a.Value,
		})
	}
	return out
}

// isSafeHref permits only fragment-local references (e.g. "#gradient1"),
// which is what SVG uses for internal links. Any scheme — javascript:, data:,
// http(s): — is rejected.
func isSafeHref(value string) bool {
	v := strings.TrimSpace(value)
	return strings.HasPrefix(v, "#")
}

// extractSVGDimensions pulls width/height from the root <svg> element. Falls
// back to the viewBox "min-x min-y width height" if explicit attrs are
// missing. Returns (0, 0) when neither is parseable.
func extractSVGDimensions(t xml.StartElement) (int, int) {
	var w, h int
	var viewBox string
	for _, a := range t.Attr {
		switch strings.ToLower(a.Name.Local) {
		case "width":
			w = parseSVGLength(a.Value)
		case "height":
			h = parseSVGLength(a.Value)
		case "viewbox":
			viewBox = a.Value
		}
	}
	if w > 0 && h > 0 {
		return w, h
	}
	if viewBox != "" {
		parts := strings.Fields(viewBox)
		if len(parts) == 4 {
			vw, _ := strconv.ParseFloat(parts[2], 64)
			vh, _ := strconv.ParseFloat(parts[3], 64)
			return int(vw), int(vh)
		}
	}
	return w, h
}

// parseSVGLength extracts the numeric portion of an SVG length like "256",
// "256px", "16em". We only care about the leading number for metadata.
func parseSVGLength(v string) int {
	v = strings.TrimSpace(v)
	end := 0
	for end < len(v) {
		c := v[end]
		if (c >= '0' && c <= '9') || c == '.' || c == '-' {
			end++
			continue
		}
		break
	}
	if end == 0 {
		return 0
	}
	f, err := strconv.ParseFloat(v[:end], 64)
	if err != nil {
		return 0
	}
	return int(f)
}
