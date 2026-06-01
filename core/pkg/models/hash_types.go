package models

import "strings"

// HashTypeSpec describes a known hash family — display name plus the hashcat
// numeric mode operators paste into their offline jobs. The list is curated:
// hashcat has hundreds of modes, we surface the ones an AD-focused pentester
// touches weekly. Unknown types are still accepted via the OTHER bucket and
// pass through with HashcatMode = 0.
type HashTypeSpec struct {
	Name        string // canonical name stored on Hash.HashType
	DisplayName string // shown in UI
	HashcatMode int    // hashcat -m value; 0 = unknown / not applicable
}

// HashTypeOther is the escape hatch for hashes that do not match any preset.
// HashcatMode stays 0 — the operator types the mode by hand when running
// hashcat.
const HashTypeOther = "OTHER"

// knownHashTypes is the preset list. Order is the order shown to operators
// in the type picker — common AD types first, then generic, then OTHER.
var knownHashTypes = []HashTypeSpec{
	{Name: "NTLM", DisplayName: "NTLM", HashcatMode: 1000},
	{Name: "NETNTLMV1", DisplayName: "NetNTLMv1", HashcatMode: 5500},
	{Name: "NETNTLMV2", DisplayName: "NetNTLMv2", HashcatMode: 5600},
	{Name: "KRB5TGS", DisplayName: "Kerberos 5 TGS-REP (RC4)", HashcatMode: 13100},
	{Name: "KRB5ASREP", DisplayName: "Kerberos 5 AS-REP (RC4)", HashcatMode: 18200},
	{Name: "KRB5TGS_AES256", DisplayName: "Kerberos 5 TGS-REP (AES256)", HashcatMode: 19700},
	{Name: "MSCASH2", DisplayName: "MS-Cache v2 (DCC2)", HashcatMode: 2100},
	{Name: "LM", DisplayName: "LM", HashcatMode: 3000},
	{Name: "MD5", DisplayName: "MD5", HashcatMode: 0},
	{Name: "SHA1", DisplayName: "SHA1", HashcatMode: 100},
	{Name: "SHA256", DisplayName: "SHA-256", HashcatMode: 1400},
	{Name: "SHA512", DisplayName: "SHA-512", HashcatMode: 1700},
	{Name: "BCRYPT", DisplayName: "bcrypt", HashcatMode: 3200},
	{Name: HashTypeOther, DisplayName: "Other", HashcatMode: 0},
}

// HashTypeSpecs returns the curated preset list. Order is stable for UI use.
func HashTypeSpecs() []HashTypeSpec {
	out := make([]HashTypeSpec, len(knownHashTypes))
	copy(out, knownHashTypes)
	return out
}

// LookupHashType resolves a free-form input (case-insensitive, trims) against
// the preset list. Returns the spec and true on a match; (zero, false) otherwise.
// Callers fall back to {Name: input-upper, HashcatMode: 0} for unknown inputs
// — see NormalizeHashType.
func LookupHashType(name string) (HashTypeSpec, bool) {
	upper := strings.ToUpper(strings.TrimSpace(name))
	if upper == "" {
		return HashTypeSpec{}, false
	}
	for _, t := range knownHashTypes {
		if t.Name == upper {
			return t, true
		}
	}
	return HashTypeSpec{}, false
}

// NormalizeHashType maps a free-form input to a canonical (name, hashcat mode)
// pair. Unknown inputs are uppercased and pass through with hashcat mode 0,
// which keeps the field shape predictable without forcing operators to wait on
// a curated entry for an exotic hash family.
func NormalizeHashType(name string) (string, int) {
	if spec, ok := LookupHashType(name); ok {
		return spec.Name, spec.HashcatMode
	}
	return strings.ToUpper(strings.TrimSpace(name)), 0
}
