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
