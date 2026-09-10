package mcp

// toolGroups organizes the tool surface for the generated skill.
//
// An explicit table rather than a prefix rule: the names are consistent enough
// that a rule would mostly work, and "mostly" is how a tool ends up filed
// under the wrong heading and never found. Anything missing here lands in
// "Other", which a test refuses — so a new tool cannot be shipped without
// someone deciding where it belongs.
//
// Order is the order an agent should meet them: orient, then look, then change.
var toolGroups = []toolGroup{
	{
		Title: "Orientation",
		Intro: "Where you are and what you can reach. Start here when you do not already know which operation you are working in.",
		Tools: []string{"list_operations", "get_operation_summary", "get_user_focus"},
	},
	{
		Title: "Hosts and the network",
		Intro: "The topology view is drawn from these records: interfaces place a host on a subnet, routes give reachability, and logins draw the users lens. A host recorded without them is an isolated dot.",
		Tools: []string{"find_hosts", "get_host", "create_host", "update_host"},
	},
	{
		Title: "Credentials",
		Intro: "Secret material recovered during the engagement. Returned in full, including plaintext.",
		Tools: []string{"find_credentials", "get_credential", "create_credential", "add_credential_comment"},
	},
	{
		Title: "Hashes",
		Intro: "Captured hashes and what became of them. mark_hash_cracked is what turns a dump into something usable.",
		Tools: []string{"find_hashes", "get_hash", "create_hash", "import_hashes", "update_hash", "mark_hash_cracked"},
	},
	{
		Title: "Tasks",
		Intro: "The operator's board. Propose work here rather than doing something nobody asked for. " +
			"You can see and change tasks assigned to the operator you act for, and unassigned ones; " +
			"tasks another operator has taken are not yours to read or edit.\n\n" +
			"A task is only half a record without its references. Every task you create or touch " +
			"should point at the wiki pages it comes out of or writes up, and at the credentials it " +
			"needs or produces. Pass `wiki_ids` and `credential_ids` to `create_task` so the links " +
			"land with the task; use `add_task_wiki_reference` and `add_task_credential_reference` " +
			"when you learn about the connection later. `get_task` lists what is already linked, and " +
			"every task view carries `wikiReferenceCount` and `credentialReferenceCount` — a zero " +
			"there on a task you are working is the cue to go and link something.",
		Tools: []string{"find_tasks", "get_task", "create_task", "update_task", "change_task_stage",
			"assign_task_to_me", "unassign_task_from_me", "add_task_wiki_reference",
			"add_task_credential_reference"},
	},
	{
		Title: "Wiki",
		Intro: "Engagement notes. Pages are collaboratively edited, so the operator may be reading one while you write to it. " +
			"Pages can also carry file attachments — the evidence the notes are about.\n\n" +
			"A page is richer than plain markdown: checklist items (`:::checklist {...}`), notices " +
			"(`:::warning`), and inline reference chips to hosts, hashes, credentials and other " +
			"pages. You read and write all of them as markdown, and `update_wiki_document` " +
			"replaces the whole body — so read a page before rewriting it and put back every " +
			"construct you are not deliberately changing. See workflows.md, \"What a page can " +
			"contain\".",
		Tools: []string{"search_wiki", "list_wiki_tree", "get_wiki_document",
			"list_wiki_templates", "create_wiki_document_from_template", "set_wiki_template",
			"create_wiki_document", "append_wiki_section", "edit_wiki_document",
			"update_wiki_document",
			"list_wiki_attachments", "read_wiki_attachment"},
	},
	{
		Title: "Timeline",
		Intro: "The shared history of the engagement.",
		Tools: []string{"get_timeline", "create_timeline_event"},
	},
}

type toolGroup struct {
	Title string
	Intro string
	Tools []string
}

// groupedTools arranges the live registry into the groups above, returning
// anything unclaimed so it is visible rather than quietly dropped.
func groupedTools(tools []toolDoc) (groups []renderedGroup, ungrouped []toolDoc) {
	byName := make(map[string]toolDoc, len(tools))
	for _, t := range tools {
		byName[t.Name] = t
	}

	claimed := map[string]bool{}
	for _, g := range toolGroups {
		rendered := renderedGroup{Title: g.Title, Intro: g.Intro}
		for _, name := range g.Tools {
			t, ok := byName[name]
			if !ok {
				// Listed in a group but not registered — a rename, most
				// likely. Skip rather than documenting a tool that is not
				// there, which would send an agent calling something that
				// does not exist.
				continue
			}
			claimed[name] = true
			rendered.Tools = append(rendered.Tools, t)
		}
		if len(rendered.Tools) > 0 {
			groups = append(groups, rendered)
		}
	}

	for _, t := range tools {
		if !claimed[t.Name] {
			ungrouped = append(ungrouped, t)
		}
	}
	return groups, ungrouped
}

type renderedGroup struct {
	Title string
	Intro string
	Tools []toolDoc
}
