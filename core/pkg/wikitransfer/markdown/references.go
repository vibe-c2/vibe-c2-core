package markdown

import (
	"regexp"
	"strings"

	"github.com/google/uuid"
)

// referenceLinkFull matches a whole inline reference chip as the sidecar
// serializer writes it: `[label](vibe://<kind>/<id>)`. The label is the
// generic word the serializer uses ("page", "host", "hash") because the
// sidecar only sees ids; the exporter is the first place that knows what
// the id names.
var referenceLinkFull = regexp.MustCompile(`\[([^\]\n]*)\]\(vibe://(doc|host|hash)/([0-9a-fA-F-]{36})\)`)

// referenceTarget is what a chip becomes in the foreign markdown. An empty
// Href renders as plain text — the reader still sees what was referenced,
// there is just nowhere in the zip to send them.
type referenceTarget struct {
	Text string
	Href string
}

// referenceResolver maps one chip to its rendering. Returning ok=false
// means "nothing better known": the chip is lowered to its original label
// as plain text so no vibe:// link ever reaches the archive.
type referenceResolver func(kind string, id uuid.UUID) (referenceTarget, bool)

// rewriteReferenceLinks replaces every `[label](vibe://kind/id)` link with
// the resolver's rendering. The markdown zip is for editors that know
// nothing about Vibe, so the output never contains the vibe:// scheme:
// a resolved page becomes `[Title](relative/path.md)`, a host or hash
// becomes its display value, and anything unresolvable becomes the label.
func rewriteReferenceLinks(body string, resolve referenceResolver) string {
	return referenceLinkFull.ReplaceAllStringFunc(body, func(match string) string {
		m := referenceLinkFull.FindStringSubmatch(match)
		label, kind := m[1], m[2]
		id, err := uuid.Parse(m[3])
		if err != nil {
			return label
		}
		target, ok := resolve(kind, id)
		if !ok || target.Text == "" {
			return label
		}
		if target.Href == "" {
			return target.Text
		}
		return "[" + escapeLinkText(target.Text) + "](" + target.Href + ")"
	})
}

// escapeLinkText makes a title safe as markdown link text. Titles are free
// text; an unescaped `]` would end the link early.
func escapeLinkText(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `[`, `\[`, `]`, `\]`)
	return r.Replace(s)
}

// relativeLink returns the path of target relative to the directory that
// holds from, in the `../a/b.md` form markdown editors resolve once the
// zip is unpacked. Both arguments are zip-internal paths with forward
// slashes.
func relativeLink(from, to string) string {
	fromDirs := splitDirs(from)
	toSegs := strings.Split(to, "/")
	toDirs := toSegs[:len(toSegs)-1]

	common := 0
	for common < len(fromDirs) && common < len(toDirs) && fromDirs[common] == toDirs[common] {
		common++
	}

	var b strings.Builder
	for i := common; i < len(fromDirs); i++ {
		b.WriteString("../")
	}
	b.WriteString(strings.Join(toSegs[common:], "/"))
	return b.String()
}

// splitDirs returns the directory segments of a zip path, excluding the
// final file name.
func splitDirs(p string) []string {
	segs := strings.Split(p, "/")
	return segs[:len(segs)-1]
}
