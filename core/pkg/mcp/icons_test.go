package mcp

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// frontendCatalogPath is the operator's own icon picker. The Go palette is a
// copy of it, and a copy nobody checks is a copy that drifts.
const frontendCatalogPath = "../../../frontend/src/components/wiki/icon-catalog.ts"

func TestValidateIcon(t *testing.T) {
	t.Run("accepts a curated name", func(t *testing.T) {
		for _, name := range []string{"FileText", "Server", "Key", "Network"} {
			if err := validateIcon(name); err != nil {
				t.Errorf("validateIcon(%q) = %v, want nil", name, err)
			}
		}
	})

	t.Run("accepts the adaptive default", func(t *testing.T) {
		if err := validateIcon(AdaptiveIconName); err != nil {
			t.Errorf("validateIcon(%q) = %v, want nil", AdaptiveIconName, err)
		}
	})

	t.Run("accepts empty as not supplied", func(t *testing.T) {
		if err := validateIcon(""); err != nil {
			t.Errorf("validateIcon(\"\") = %v, want nil", err)
		}
	})

	t.Run("refuses kebab-case, which is the likely guess", func(t *testing.T) {
		// The storage convention is PascalCase and nothing in the tool schema
		// says so, so this is the mistake a model will actually make. It must
		// be refused rather than stored and silently ignored by the client.
		err := validateIcon("file-text")
		if err == nil {
			t.Fatal("kebab-case was accepted; it would store and never render")
		}
		if !isRefusal(err) {
			t.Errorf("a bad icon name should be a refusal, not a fault: %v", err)
		}
		if !strings.Contains(err.Error(), "PascalCase") {
			t.Errorf("the refusal should say what shape a name takes: %v", err)
		}
	})

	t.Run("refuses an invented name", func(t *testing.T) {
		if err := validateIcon("ServerRack"); err == nil {
			t.Fatal("an invented icon name was accepted")
		}
	})
}

// The refusal suggests names. Every one has to be real: the first draft
// offered "KeyRound", which this palette does not have, so the error would
// have handed a model a name it was about to be refused for.
func TestIconExamplesAreAllValid(t *testing.T) {
	for _, name := range iconExamples {
		if err := validateIcon(name); err != nil {
			t.Errorf("the refusal suggests %q, which is not in the palette", name)
		}
	}
}

func TestVisualIdentity(t *testing.T) {
	t.Run("emoji and icon together are refused", func(t *testing.T) {
		v := visualIdentity{Emoji: "🔑", Icon: "Key"}
		err := v.validate()
		if err == nil {
			t.Fatal("both were accepted; the client renders one or the other")
		}
		if !isRefusal(err) {
			t.Errorf("should be a refusal: %v", err)
		}
	})

	t.Run("either alone is fine", func(t *testing.T) {
		for _, v := range []visualIdentity{{Emoji: "🔑"}, {Icon: "Key"}, {}} {
			if err := v.validate(); err != nil {
				t.Errorf("%+v: %v", v, err)
			}
		}
	})

	t.Run("unset fields stay nil so an update leaves them alone", func(t *testing.T) {
		emoji, icon, color := visualIdentity{Icon: "Key"}.apply()
		if emoji != nil {
			t.Error("emoji should be nil when not supplied")
		}
		if color != nil {
			t.Error("color should be nil when not supplied")
		}
		if icon == nil || *icon != "Key" {
			t.Errorf("icon = %v, want Key", icon)
		}
	})
}

// The palette is a copy of the client's curated catalog. This parses that file
// and fails when the two diverge — an icon added to the picker but not here is
// one an agent is refused for choosing, and one removed there is one an agent
// can store that will never render.
func TestIconPaletteMatchesTheFrontendCatalog(t *testing.T) {
	source, err := os.ReadFile(frontendCatalogPath)
	if err != nil {
		t.Skipf("frontend catalog not readable from here (%v); skipping the drift check", err)
	}

	catalog := string(source)
	start := strings.Index(catalog, "export const ICON_CATALOG")
	end := strings.Index(catalog, "export const ICON_LOOKUP")
	if start < 0 || end < 0 || end < start {
		t.Fatal("could not find ICON_CATALOG in the frontend file; the drift check needs updating")
	}

	entryRe := regexp.MustCompile(`entry\("([A-Za-z0-9]+)"`)
	frontend := map[string]bool{}
	for _, m := range entryRe.FindAllStringSubmatch(catalog[start:end], -1) {
		frontend[m[1]] = true
	}
	if len(frontend) == 0 {
		t.Fatal("parsed no icons from the frontend catalog; the drift check needs updating")
	}

	ours := map[string]bool{}
	for _, name := range curatedIcons {
		ours[name] = true
	}

	for name := range frontend {
		if !ours[name] {
			t.Errorf("%q is in the operator's icon picker but not in the agent palette — "+
				"an agent choosing it would be refused", name)
		}
	}
	for name := range ours {
		if !frontend[name] {
			t.Errorf("%q is in the agent palette but not in the picker — "+
				"an agent could store it and it would never render", name)
		}
	}
}

// Creating a wiki page with no icon must store the adaptive default, not an
// empty string. The two look similar at a glance and behave differently: only
// "Adaptive" switches to a folder glyph when the page gains children, so an
// empty one would leave agent-made pages quietly unlike every human-made one.
func TestVisualIdentity_AdaptiveDefaultOnCreate(t *testing.T) {
	t.Run("nothing supplied gets the adaptive default", func(t *testing.T) {
		emoji, icon, color := visualIdentity{}.applyWithAdaptiveDefault()
		if icon == nil || *icon != AdaptiveIconName {
			t.Fatalf("icon = %v, want %q", icon, AdaptiveIconName)
		}
		if emoji != nil || color != nil {
			t.Error("only the icon should be defaulted")
		}
	})

	t.Run("an explicit icon is left alone", func(t *testing.T) {
		_, icon, _ := visualIdentity{Icon: "Key"}.applyWithAdaptiveDefault()
		if icon == nil || *icon != "Key" {
			t.Fatalf("icon = %v, want Key", icon)
		}
	})

	t.Run("an emoji suppresses the default", func(t *testing.T) {
		// Defaulting the icon here would set both, which the client treats as
		// mutually exclusive and the validator refuses.
		emoji, icon, _ := visualIdentity{Emoji: "📓"}.applyWithAdaptiveDefault()
		if icon != nil {
			t.Fatalf("icon = %v, want nil when an emoji was chosen", *icon)
		}
		if emoji == nil || *emoji != "📓" {
			t.Fatalf("emoji = %v", emoji)
		}
	})

	// Updates must NOT default: an update that mentions no icon has to leave
	// whatever the operator chose in place.
	t.Run("plain apply never defaults", func(t *testing.T) {
		_, icon, _ := visualIdentity{}.apply()
		if icon != nil {
			t.Fatalf("icon = %v, want nil so an update leaves it alone", *icon)
		}
	})
}

// The skill names example icons in prose. Every one has to be in the palette,
// for the same reason the refusal message's examples do: a document that
// suggests a name the server refuses teaches the agent something false, and
// prose is where that is easiest to get wrong and hardest to notice.
func TestSkillIconExamplesAreAllValid(t *testing.T) {
	// The icon guidance is its own reference file, so the whole file is the
	// section. Backtick-quoted names only, so prose is not dragged in.
	icons, ok := findReferenceGuide("icons")
	if !ok {
		t.Fatal("the icons reference guide is gone; this check needs updating")
	}
	section := icons.Content

	// Both namespaces: PascalCase concept icons and si:-prefixed brand slugs.
	// Checking only the first would have let a wrong brand slug through, and
	// brands are the easier of the two to get wrong — si:windows looks
	// entirely plausible and does not exist.
	pattern := regexp.MustCompile("`(" + SimpleIconPrefix + "[a-z0-9._-]+|[A-Z][A-Za-z0-9]+)`")
	names := pattern.FindAllStringSubmatch(section, -1)
	if len(names) == 0 {
		t.Fatal("found no icon examples in the guide's icon section; this check needs updating")
	}

	var sawBrand bool
	for _, m := range names {
		if strings.HasPrefix(m[1], SimpleIconPrefix) {
			sawBrand = true
		}
		if err := validateIcon(m[1]); err != nil {
			t.Errorf("the guide suggests icon %q, which the server refuses", m[1])
		}
	}
	if !sawBrand {
		t.Error("the guide's icon section names no brand logos; either it stopped " +
			"documenting them or this check is no longer matching them")
	}
}

func TestValidateIcon_BrandLogos(t *testing.T) {
	t.Run("accepts a curated brand slug", func(t *testing.T) {
		for _, name := range []string{"si:linux", "si:docker", "si:kubernetes", "si:nginx"} {
			if err := validateIcon(name); err != nil {
				t.Errorf("validateIcon(%q) = %v, want nil", name, err)
			}
		}
	})

	t.Run("refuses an uncurated brand", func(t *testing.T) {
		// simple-icons has no Windows logo, which is worth failing loudly on:
		// most targets in this domain are Windows, so it is the brand an agent
		// is most likely to reach for and not find.
		err := validateIcon("si:windows")
		if err == nil {
			t.Fatal("si:windows was accepted; it would store and never render")
		}
		if !isRefusal(err) {
			t.Errorf("should be a refusal: %v", err)
		}
	})

	t.Run("a brand slug is not measured against the lucide palette", func(t *testing.T) {
		// Dispatching on the prefix matters: without it "si:linux" would be
		// looked up among PascalCase names and refused for the wrong reason,
		// telling the agent to use PascalCase when the real answer is that the
		// brand is fine.
		err := validateIcon("si:notabrandatall")
		if err == nil {
			t.Fatal("an invented brand was accepted")
		}
		if strings.Contains(err.Error(), "PascalCase") {
			t.Errorf("a bad brand slug was reported as a lucide problem: %v", err)
		}
		if !strings.Contains(err.Error(), "simple-icons") {
			t.Errorf("the refusal should name the namespace: %v", err)
		}
	})

	t.Run("the bare prefix is refused", func(t *testing.T) {
		if err := validateIcon("si:"); err == nil {
			t.Fatal("an empty brand slug was accepted")
		}
	})
}

// Same guard as iconExamples: the refusal must not suggest a slug the palette
// does not have. The first draft offered "si:windows".
func TestSimpleIconExamplesAreAllValid(t *testing.T) {
	for _, name := range simpleIconExamples {
		if err := validateIcon(name); err != nil {
			t.Errorf("the refusal suggests %q, which is not in the palette", name)
		}
	}
}

// The brand palette mirrors the client's curated groups, and drifts the same
// way the lucide one would.
func TestSimpleIconPaletteMatchesTheFrontendCatalog(t *testing.T) {
	source, err := os.ReadFile("../../../frontend/src/components/wiki/simple-icon-catalog.ts")
	if err != nil {
		t.Skipf("frontend catalog not readable from here (%v); skipping the drift check", err)
	}

	catalog := string(source)
	start := strings.Index(catalog, "export const SIMPLE_ICON_CATALOG")
	end := strings.Index(catalog, "export const CURATED_SIMPLE_SLUGS")
	if start < 0 || end < 0 || end < start {
		t.Fatal("could not find SIMPLE_ICON_CATALOG; the drift check needs updating")
	}

	// Only the first argument of si(...) — the rest are search keywords, not
	// slugs, and treating them as slugs would let a keyword pass validation.
	slugRe := regexp.MustCompile(`\bsi\("([a-z0-9][a-z0-9._-]*)"`)
	frontend := map[string]bool{}
	for _, m := range slugRe.FindAllStringSubmatch(catalog[start:end], -1) {
		frontend[m[1]] = true
	}
	if len(frontend) == 0 {
		t.Fatal("parsed no brand slugs; the drift check needs updating")
	}

	ours := map[string]bool{}
	for _, slug := range curatedSimpleIconSlugs {
		ours[slug] = true
	}

	for slug := range frontend {
		if !ours[slug] {
			t.Errorf("%q is in the operator's brand picker but not in the agent palette", slug)
		}
	}
	for slug := range ours {
		if !frontend[slug] {
			t.Errorf("%q is in the agent palette but not in the picker — "+
				"an agent could store it and it would never render", slug)
		}
	}
}
