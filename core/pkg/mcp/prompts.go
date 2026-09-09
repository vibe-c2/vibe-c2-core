package mcp

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Prompts are the recurring jobs an operator actually hands to an agent,
// packaged so they can be started from a menu rather than retyped. Each one
// mainly encodes the ORDER to work in — which is where an agent left to its
// own devices tends to waste calls or reach a confident wrong conclusion.

func registerPrompts(s *Server) {
	s.server.AddPrompt(&mcp.Prompt{
		Name:        "triage_findings",
		Description: "Review what has been collected in an operation and propose what to do next.",
		Arguments: []*mcp.PromptArgument{
			{Name: "operation_id", Description: "Operation to triage. Defaults to whatever the operator currently has open."},
		},
	}, promptHandler(triageFindings))

	s.server.AddPrompt(&mcp.Prompt{
		Name:        "engagement_notes",
		Description: "Draft wiki notes for a host from what is already recorded about it.",
		Arguments: []*mcp.PromptArgument{
			{Name: "host_id", Description: "The host to write up.", Required: true},
		},
	}, promptHandler(engagementNotes))

	s.server.AddPrompt(&mcp.Prompt{
		Name:        "whats_changed",
		Description: "Summarize recent activity in an operation for someone picking it back up.",
		Arguments: []*mcp.PromptArgument{
			{Name: "operation_id", Description: "Operation to summarize. Defaults to whatever the operator currently has open."},
		},
	}, promptHandler(whatsChanged))
}

func promptHandler(build func(args map[string]string) string) mcp.PromptHandler {
	return func(_ context.Context, req *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		return &mcp.GetPromptResult{
			Messages: []*mcp.PromptMessage{{
				Role:    "user",
				Content: &mcp.TextContent{Text: build(req.Params.Arguments)},
			}},
		}, nil
	}
}

func operationClause(args map[string]string) string {
	if id := args["operation_id"]; id != "" {
		return fmt.Sprintf("operation %s", id)
	}
	// Leaving it implicit is the point: the tools resolve the operator's
	// current focus themselves, and naming an id the caller did not give
	// would be a guess.
	return "the operation the operator currently has open"
}

func triageFindings(args map[string]string) string {
	return fmt.Sprintf(`Triage %s.

Work in this order so you reason over the whole picture rather than the first thing you find:

1. get_operation_summary, to see the shape of what is here.
2. find_hosts and find_credentials to see what has been collected. If a result says it was
   truncated, narrow the filter rather than assuming you have seen everything.
3. find_hashes, and note which ones are already cracked into credentials.
4. find_tasks, so you do not propose work the operator has already planned.

Then tell the operator, briefly:
- what stands out — reused credentials, hosts sharing a subnet, cracked hashes nobody acted on;
- what is missing that you would expect to see;
- two or three concrete next steps, ordered by what they would unlock.

Propose. Do not create tasks or edit pages unless the operator asks you to.`, operationClause(args))
}

func engagementNotes(args map[string]string) string {
	return fmt.Sprintf(`Draft engagement notes for host %s.

Read get_host first, then search_wiki for anything already written about it — do not duplicate a
page that exists. Look for credentials and hashes that relate to it.

Write the draft as Markdown: what the host is, how it is reached, what was found on it, and what
is still unknown. Say plainly what you are inferring rather than reading from a record.

Show it to the operator before writing anything. If they want it saved, create_wiki_document.`,
		args["host_id"])
}

func whatsChanged(args map[string]string) string {
	return fmt.Sprintf(`Summarize recent activity in %s for someone picking the engagement back up.

Use get_timeline for the last few days, and find_tasks to see what moved. Group by theme rather
than replaying the log line by line — the operator wants to know where things stand, not what
order events were recorded in.

Finish with what appears to be blocked or waiting on someone.`, operationClause(args))
}
