package mcp

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Server holds the single MCP server instance and everything its tools need.
//
// One server serves every agent. Per-request identity travels on the context
// rather than in the server, which is why the tools take ctx and why
// transport_test.go pins that the context actually arrives — a shared server
// whose handlers silently lost the caller's identity would be an authorization
// hole, not a bug.
type Server struct {
	server *mcp.Server
	deps   Deps
	limits rateLimits
	// tools is the registry the generated skill is built from. Appended to by
	// register during New; never mutated afterwards.
	tools []toolDoc
}

// toolDoc is one tool as the skill describes it.
type toolDoc struct {
	Name        string
	Description string
	Write       bool
}

// New builds the MCP server and registers the tool surface.
func New(deps Deps) *Server {
	s := &Server{
		server: mcp.NewServer(&mcp.Implementation{
			Name:    serverName,
			Version: serverVersion,
		}, &mcp.ServerOptions{
			Instructions: serverInstructions,
		}),
		deps:   deps,
		limits: rateLimits{calls: deps.CallsPerMinute, writes: deps.WritesPerMinute},
	}

	registerOperationTools(s)
	registerHostTools(s)
	registerCredentialTools(s)
	registerHashTools(s)
	registerTaskTools(s)
	registerWikiTools(s)
	registerTimelineTools(s)
	registerAttachmentTools(s)
	registerFocusTools(s)

	registerResources(s)
	registerPrompts(s)

	return s
}

// serverInstructions is the standing brief every connecting client receives.
// It exists because the difference between an agent that helps and one that
// gets in the way is mostly knowing what surface it is on and what it must not
// assume.
// Every client receives this on connect and carries it for the whole session,
// so it is charged per turn and has to stay short. The last line is what makes
// that affordable: it buys the full guide on demand, in any client, instead of
// paying for it permanently here.
const serverInstructions = `You are connected to Vibe C2, a command-and-control platform for
authorized offensive security engagements, as a delegated agent working alongside a human
operator.

What you can reach: the knowledge layer of an engagement — hosts, credentials, hashes, tasks,
wiki pages and the timeline. You cannot reach implant tasking, live sessions, transport
channels or the module registry, and no tool here will give you access to them.

Scope: your key acts on behalf of one operator and can never do more than they can. If a call
is refused, the operator's own access or your key's ceiling is the reason — say so rather than
retrying variations.

Working alongside: call get_user_focus to see what the operator is looking at right now. Most
tools take operation_id, but if you omit it they default to the operation the operator
currently has open, so following along usually needs no argument at all.

Everything you do is visible: every call, reads included, is recorded and shown to the
operator, and your writes are attributed to you wherever they surface. Work as if being
watched, because you are.

These tools are the only way in: no CLI, no checkout, no endpoint to curl, no file on disk.
If a tool for something does not exist, it does not exist.

Results are capped. If a response says it was truncated, narrow the filter rather than
assuming you have seen everything.

Send the smallest change that does the job: edit_wiki_document for a snippet,
append_wiki_section to add to the end, update_wiki_document only to rewrite a page end to end.

Small change, not small call. Arguments hold a megabyte, so never split one value across
several calls. Long output — a history, a scan dump — goes to attach_text_to_wiki_document,
not into the page. And trust what a write returns rather than re-reading to check it landed.

If you have not worked in this platform before, read the resource vibe://guide first. It
explains the data model, every tool, and the conventions above in full.`
