package mcp

import (
	"errors"
	"fmt"
	"strings"
)

// A refusal is a policy decision: the agent asked for something it is not
// allowed to have. It is not a failure, and the two must stay distinguishable.
//
// A run full of refusals means the key is scoped tighter than the work being
// asked of it — a configuration answer. A run full of errors means something
// is broken. Conflating them sends an operator debugging a permission
// decision, or ignoring a real fault as "just permissions".
//
// Typed rather than matched on message text. The first version of this
// compared error strings against a list of phrases, which is guesswork: it
// classified the rate limiter correctly because that phrasing was on the list,
// and misfiled genuine refusals whose wording had not been anticipated. A list
// like that is wrong by default for every message nobody remembered to add.
type refusal struct{ err error }

func (r refusal) Error() string { return r.err.Error() }
func (r refusal) Unwrap() error { return r.err }

// refuse builds a policy refusal.
func refuse(format string, args ...any) error {
	return refusal{err: fmt.Errorf(format, args...)}
}

// forbiddenPrefix is how package authorization reports every denial. That is a
// stable contract across all of its paths, so prefix-matching it is reliable
// in a way that guessing at domain wording is not.
const forbiddenPrefix = "forbidden"

// isRefusal reports whether an error is a policy decision rather than a fault.
//
// Domain refusals raised deep inside a resolver with their own wording — "this
// document is not in the task's operation" — are NOT caught here and land as
// errors. That is the honest outcome: this layer cannot tell them apart from
// a fault without the resolver saying so, and guessing is what produced the
// wrong answers before.
func isRefusal(err error) bool {
	var r refusal
	if errors.As(err, &r) {
		return true
	}
	return strings.HasPrefix(err.Error(), forbiddenPrefix)
}
