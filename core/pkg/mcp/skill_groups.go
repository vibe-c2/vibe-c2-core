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
		Intro: "Where you are and what you can reach.",
		Tools: []string{"list_operations", "get_operation_summary", "get_user_focus"},
	},
	{
		Title: "Hosts and the network",
		Intro: "Interfaces, routes and logins are what the topology view draws from.",
		Tools: []string{"find_hosts", "get_host", "create_host", "update_host"},
	},
	{
		Title: "Credentials",
		Intro: "Recovered secrets, returned in full.",
		Tools: []string{"find_credentials", "get_credential", "create_credential",
			"update_credential", "add_credential_comment"},
	},
	{
		Title: "Hashes",
		Intro: "Captured hashes and what became of them.",
		Tools: []string{"find_hashes", "get_hash", "create_hash", "import_hashes", "update_hash", "mark_hash_cracked"},
	},
	{
		Title: "Tasks",
		Intro: "The operator's board. Propose work here rather than doing something nobody asked for. " +
			"You see tasks assigned to the operator you act for and unassigned ones; tasks another " +
			"operator has taken are withheld. Link every task to the pages and credentials it " +
			"relates to (`wiki_ids`/`credential_ids` on `create_task`, or `link_task` later).",
		Tools: []string{"find_tasks", "get_task", "create_task", "update_task", "change_task_stage",
			"set_task_assignment", "link_task"},
	},
	{
		Title: "Wiki",
		Intro: "Engagement notes, collaboratively edited, with file attachments. See wiki.md and attachments.md.",
		Tools: []string{"search_wiki", "list_wiki_tree", "get_wiki_document",
			"list_wiki_templates", "set_wiki_template",
			"create_wiki_document", "add_wiki_section",
			"edit_wiki_document", "update_wiki_document",
			"move_wiki_document", "delete_wiki_document",
			"list_wiki_attachments", "read_wiki_attachment",
			"attach_text_to_wiki_document", "attach_file_to_wiki_document"},
	},
	{
		Title: "Timeline",
		Intro: "Milestones only: a task closed, a credential recovered, a hash cracked, and whatever you record with create_timeline_event — a DC owned, a foothold lost. Wiki edits and task bookkeeping do not appear.",
		Tools: []string{"get_timeline", "create_timeline_event"},
	},
	{
		Title: "Skills",
		Intro: "Working methods other operators have published, packaged the way this skill is. See skills.md.",
		Tools: []string{"find_skills", "get_skill"},
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
