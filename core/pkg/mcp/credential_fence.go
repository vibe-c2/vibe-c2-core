package mcp

import (
	"encoding/json"
	"strings"
)

// Guarding the credential chip.
//
// A credential renders on a page as a fenced block whose info-string is
// exactly `vibe-credential` and whose body is JSON carrying the credential's
// id. The sidecar's parser lifts such a fence into a chip; a fence it cannot
// parse is left alone, which means it renders as an ordinary code block
// showing a uuid.
//
// That failure is silent and it looked like success: the write was accepted,
// the markdown read back the way it was sent, and nothing anywhere said the
// chip had not been made. An agent hit it repeatedly, tried a bare uuid, then
// a vibe://credential/ link that does not exist, and finally copied a broken
// fence off another page — which is how the broken form spreads.
//
// So a malformed fence is refused before the write lands, with the shape that
// works. Same reasoning as an unknown icon name: a refusal an agent can read
// and correct beats a write that quietly did less than it claimed.

// credentialFenceInfo is the info-string the sidecar keys on. It must stay in
// step with CREDENTIAL_FENCE_INFO in hocuspocus/src/markdown-serializer.ts.
const credentialFenceInfo = "vibe-credential"

// checkCredentialFences refuses markdown carrying a credential fence the
// renderer would not turn into a chip.
//
// Only this fence is checked. Every other block is free-form by design, and
// the whole point here is that this one has a contract an agent cannot see
// from the tool schema.
func checkCredentialFences(markdown string) error {
	// Fence tracking rather than a regex, so an example of the syntax wrapped
	// in a longer ```` fence — which is how the guides show it — is content,
	// not a fence to validate.
	var openDelim string
	var info string
	var body strings.Builder

	finish := func() error {
		if info != credentialFenceInfo {
			return nil
		}
		return validateCredentialFenceBody(body.String())
	}

	for _, line := range strings.Split(markdown, "\n") {
		trimmed := strings.TrimLeft(line, " ")
		delim := leadingFenceDelimiter(trimmed)

		if openDelim == "" {
			if delim == "" {
				continue
			}
			openDelim = delim
			info = strings.TrimSpace(trimmed[len(delim):])
			body.Reset()
			continue
		}

		// Inside a fence. A closing fence is the same character, at least as
		// long, and carries no info string; anything else is content.
		if delim != "" && delim[0] == openDelim[0] && len(delim) >= len(openDelim) &&
			strings.TrimSpace(trimmed[len(delim):]) == "" {
			if err := finish(); err != nil {
				return err
			}
			openDelim, info = "", ""
			continue
		}
		body.WriteString(line)
		body.WriteString("\n")
	}

	// An unterminated fence closes at the end of the document, the same way
	// CommonMark closes it.
	if openDelim != "" {
		return finish()
	}
	return nil
}

// validateCredentialFenceBody applies the parser's own rule: the body must be
// JSON with a non-empty string `id`.
func validateCredentialFenceBody(body string) error {
	shape := "```" + credentialFenceInfo + "\n{\"id\": \"<credential-uuid>\"}\n```"

	var payload struct {
		ID any `json:"id"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(body)), &payload); err != nil {
		return refuse(
			"a %s block's body has to be JSON, and this one is not, so it would render as "+
				"an ordinary code block rather than a credential chip. Write it as:\n\n%s\n\n"+
				"Take the id from find_credentials or get_credential. There is no "+
				"vibe://credential/ link, and the block cannot go inside a table cell.",
			credentialFenceInfo, shape)
	}
	id, ok := payload.ID.(string)
	if !ok || id == "" {
		return refuse(
			"a %s block needs an \"id\" holding the credential's uuid as a string; without "+
				"one it renders as an ordinary code block rather than a chip. Write it as:"+
				"\n\n%s",
			credentialFenceInfo, shape)
	}
	return nil
}

// leadingFenceDelimiter returns the run of backticks or tildes opening or
// closing a fence on this line, or "" when the line is not a fence.
func leadingFenceDelimiter(line string) string {
	if len(line) < 3 {
		return ""
	}
	marker := line[0]
	if marker != '`' && marker != '~' {
		return ""
	}
	n := 0
	for n < len(line) && line[n] == marker {
		n++
	}
	if n < 3 {
		return ""
	}
	// A backtick info-string may not itself contain a backtick (CommonMark),
	// which is what keeps inline code from opening a fence.
	if marker == '`' && strings.Contains(line[n:], "`") {
		return ""
	}
	return line[:n]
}
