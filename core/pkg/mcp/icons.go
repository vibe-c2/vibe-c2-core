package mcp

import (
	_ "embed"
	"strconv"
	"strings"
)

// Every icon the client can render, and the house palette inside it.
//
// The two are not the same thing, and conflating them was a bug. The client
// resolves ANY lucide name and ANY simple-icons slug: the curated ones are
// imported directly, everything else lazily by name, and the operator's picker
// searches the full set. An agent validated against the curated subset alone
// was refused for names its operator could pick from the same picker — which
// is how a page ended up with the nearest writable glyph instead of the one it
// was told to match.
//
// So membership of the full set is what validateIcon enforces, and the curated
// list below is what it suggests. Names still have to be real: the refusal
// exists because an unknown name lands in the database, resolves to nothing on
// the client, and shows the operator a page with no icon and no error anywhere.
//
// The full sets are generated from the frontend's own dependencies; see
// iconassets/README.md. icons_test.go regenerates and fails on drift whenever
// node_modules is present.
//
//go:embed iconassets/lucide.txt
var lucideNameList string

//go:embed iconassets/simple-icons.txt
var simpleIconSlugList string

// The house palette: what a refusal suggests and what the guide teaches.
//
// Icons are stored as PascalCase lucide names — "FileText", not "file-text".
// That convention is invisible from the tool schema, so getting it wrong is
// exactly the sort of thing a model does confidently: the name lands in the
// database, resolveIcon on the client finds nothing, and the page falls back
// to the default glyph. The operator sees a document with no icon and no
// error anywhere, which is how this gap was noticed in the first place.
//
// So an unknown name is REFUSED rather than accepted and silently ignored. A
// refusal an agent can read and correct beats a write that quietly did less
// than it claimed.
//
// These mirror the catalog the operator's picker offers first. They are the
// names a refusal suggests and the ones icons.md teaches, because a shared
// palette makes an agent's pages look like the rest of the wiki rather than
// arbitrary. They are a preference, not a limit.
//
// icons_test.go parses the frontend catalog and fails if the two drift.
var curatedIcons = []string{
	// Documents
	"FileText", "File", "FileCode", "FileSpreadsheet", "FileLock", "Notebook",
	"BookOpen", "BookText", "Library", "Newspaper", "Quote", "StickyNote",
	"PenLine", "ClipboardList", "Feather",
	// Folders & storage
	"Folder", "FolderOpen", "Archive", "Box", "Inbox", "Database",
	"Server", "HardDrive", "Layers",
	// People & teams
	"User", "Users", "Briefcase", "Building", "Handshake", "Bot",
	"GraduationCap",
	// Status & priority
	"CheckCircle", "CircleCheck", "CircleAlert", "AlertCircle", "Info", "CircleHelp",
	"Star", "Flag", "Bookmark", "Bell", "Trophy", "Award",
	"Target", "Clock", "Calendar",
	// Communication
	"Mail", "MessageSquare", "Megaphone", "Phone", "Mic", "Radio",
	"Video", "Headphones",
	// Tools & code
	"Code", "Terminal", "Wrench", "Hammer", "Cog", "Network",
	"Cpu", "Bug", "FlaskConical", "Puzzle", "Waypoints", "Route",
	// Objects & symbols
	"Lightbulb", "Rocket", "Zap", "Flame", "Sparkles", "Key",
	"Lock", "Shield", "ShieldAlert", "ShieldCheck", "Tag", "Diamond",
	"Gift", "Anchor", "Footprints", "Ghost", "Smile", "Heart",
	"Eye", "Compass", "Map", "MapPin", "Globe",
	// Business & data
	"BarChart", "Activity", "DollarSign", "CreditCard", "Wallet", "ShoppingCart",
	"Truck", "Scale", "LayoutDashboard", "Filter", "Search", "List",
	"ListTodo", "Table", "Link", "Paperclip", "Image", "Film",
	// Nature & weather
	"Sun", "Moon", "Cloud", "Snowflake", "Umbrella", "Droplet",
	"Leaf", "Sprout", "TreePine", "Mountain",
	// Lifestyle
	"Coffee", "Apple", "Music", "Gamepad", "Play", "Camera",
	"Lamp", "Home", "Car", "Plane", "Ship", "Trash",
	"Scissors", "Printer", "Palette", "Paintbrush", "Download", "Swords",
}

// Brand logos, under the "si:" prefix — simple-icons slugs, lowercase, e.g.
// "si:linux" or "si:docker". A separate namespace from the lucide palette
// above, and the client dispatches on the prefix.
//
// Curated for the same reason as the lucide names above, and around the same
// four groups a security engagement actually names: operating systems, cloud
// and infrastructure, dev and data, network and security. Any other slug the
// package ships is accepted too; these are the ones worth suggesting.
var curatedSimpleIconSlugs = []string{
	// Operating systems
	"linux", "ubuntu", "debian", "archlinux", "fedora", "redhat",
	"centos", "rockylinux", "almalinux", "kalilinux", "alpinelinux", "opensuse",
	"gentoo", "freebsd", "openbsd", "android", "apple", "macos",
	"ios",
	// Cloud & infrastructure
	"googlecloud", "docker", "kubernetes", "nginx", "apache", "cloudflare",
	"digitalocean", "vmware", "proxmox", "openstack", "terraform", "ansible",
	// Dev & data
	"git", "github", "gitlab", "python", "go", "rust",
	"javascript", "typescript", "react", "nodedotjs", "postgresql", "mysql",
	"mongodb", "redis",
	// Network & security
	"wireshark", "torproject", "openvpn", "wireguard", "tailscale", "gnubash",
	"cisco", "mikrotik", "fortinet",
}

// SimpleIconPrefix marks a brand logo. Must match the client's constant.
const SimpleIconPrefix = "si:"

// AdaptiveIconName is the reserved default: the client renders it as a page or
// folder glyph depending on whether the document has children. Not a lucide
// name, so it has to be permitted explicitly.
const AdaptiveIconName = "Adaptive"

// iconSet is every lucide name the client can render, plus the adaptive
// default, which is ours rather than lucide's and so has to be added by hand.
var iconSet = newIconSet(lucideNameList, AdaptiveIconName)

// simpleIconSet is every brand slug the client can render, keyed bare.
var simpleIconSet = newIconSet(simpleIconSlugList)

// newIconSet turns an embedded newline-separated list into a lookup, ignoring
// blank lines so the files stay easy to regenerate and diff.
func newIconSet(list string, extra ...string) map[string]struct{} {
	lines := strings.Split(list, "\n")
	set := make(map[string]struct{}, len(lines)+len(extra))
	for _, name := range lines {
		if name = strings.TrimSpace(name); name != "" {
			set[name] = struct{}{}
		}
	}
	for _, name := range extra {
		set[name] = struct{}{}
	}
	return set
}

// iconExamples are the names the refusal below suggests. Held as a variable
// so a test can assert every one is actually in the palette — the first draft
// of that message offered "KeyRound", which the palette does not have, so the
// error would have handed a model a name it was about to be refused for.
var iconExamples = []string{"FileText", "Server", "Key", "ShieldAlert", "Network"}

// simpleIconExamples are suggested when a brand slug is wrong. Tested against
// the palette for the same reason as iconExamples.
var simpleIconExamples = []string{"si:linux", "si:docker", "si:kubernetes", "si:python"}

// validateIcon checks a caller-supplied icon name against what the client can
// actually render.
//
// The error names a few real options rather than the two thousand there are: a
// model that has just guessed wrong needs a nudge toward the shape and the
// house style, and pasting the whole set into an error message would cost more
// context than the document it was trying to create.
func validateIcon(name string) error {
	if name == "" {
		return nil
	}
	// Brand logos are a separate namespace with its own lookup. Dispatching on
	// the prefix here, as the client does, keeps a brand slug from being
	// measured against the lucide palette and refused for the wrong reason.
	if slug, ok := strings.CutPrefix(name, SimpleIconPrefix); ok {
		if _, known := simpleIconSet[slug]; known {
			return nil
		}
		return refuse(
			"there is no brand icon %q. Brand icons are simple-icons slugs under the %q "+
				"prefix, spelled as that package spells them (lowercase, no spaces or dots): "+
				"%s. Use a concept icon or an emoji if the brand has no mark.",
			name, SimpleIconPrefix, strings.Join(quoteAll(simpleIconExamples), ", "))
	}

	if _, ok := iconSet[name]; ok {
		return nil
	}
	return refuse(
		"there is no icon %q. Any lucide icon works, spelled PascalCase as lucide spells it "+
			"(%s, %q for the default page glyph) — so this is a misspelling or an invented "+
			"name, not a missing feature. Use the emoji field if no icon fits.",
		name, strings.Join(quoteAll(iconExamples), ", "), AdaptiveIconName)
}

func quoteAll(names []string) []string {
	out := make([]string, len(names))
	for i, n := range names {
		out[i] = strconv.Quote(n)
	}
	return out
}

// visualIdentity is the emoji/icon/colour triple every labelled entity in the
// platform carries. Embedded rather than repeated so the wording, and the
// mutual exclusivity, stay identical wherever an agent meets it.
type visualIdentity struct {
	Emoji string `json:"emoji,omitempty" jsonschema:"One emoji. Usually leave unset."`
	Icon  string `json:"icon,omitempty"  jsonschema:"Any lucide name, PascalCase (Server, Key), or si:<slug> logo. Exclusive with emoji; misspellings refused. See reference/icons.md. Usually leave unset."`
	Color string `json:"color,omitempty" jsonschema:"Hex colour for icon."`
}

// validate checks the icon name and the mutual exclusivity the client assumes.
func (v visualIdentity) validate() error {
	if v.Emoji != "" && v.Icon != "" {
		return refuse("give either emoji or icon, not both — the client renders one or the other")
	}
	return validateIcon(v.Icon)
}

// apply returns the triple as the resolver inputs expect it: nil for anything
// not supplied, so an update leaves what it does not mention alone.
func (v visualIdentity) apply() (emoji, icon, color *string) {
	return optionalString(v.Emoji), optionalString(v.Icon), optionalString(v.Color)
}

// applyWithAdaptiveDefault is apply for creating a wiki page, where leaving the
// icon unset is not the same as choosing nothing.
//
// The operator's own create dialog stores "Adaptive", and that is not merely a
// placeholder: the client renders it as a page or folder glyph depending on
// whether the document has children, so a page given it starts looking like a
// folder the moment one is nested under it. An empty icon falls through to a
// static fallback instead and never gains that behaviour — so an agent-created
// page would quietly diverge from every page a human made.
func (v visualIdentity) applyWithAdaptiveDefault() (emoji, icon, color *string) {
	e, i, c := v.apply()
	if e == nil && i == nil {
		adaptive := AdaptiveIconName
		i = &adaptive
	}
	return e, i, c
}
