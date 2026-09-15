# Wiki: reading, editing, templates

## Finding the right page

`search_wiki` returns a `snippet` with every hit. Read the snippets before
opening anything; opening four wrong pages to find the fifth is the most common
way to waste a context window here. `list_wiki_tree` shows how the notes are
organised: two levels by default with a `childCount` per page, `parent_id` to
descend into one branch, `depth:-1` for everything, and a cursor for a large
wiki.

## Reading only part of a page

`get_wiki_document` returns the body of a small page. A page over 8 KB comes
back as an **outline** (headings, nesting, bytes under each) unless you pass
`full:true`. Then:

- `section:"<heading>"` returns that heading and everything nested under it.
- Section sizes include their children, so they do not sum to the page size.
- A section is **part** of the page. Change it with `edit_wiki_document`.
  Passing it to `update_wiki_document` replaces the whole page with the
  fragment.
- Section text is exact, so it is the cheapest source of `old_text`.

## Changing a page

- `edit_wiki_document` replaces an exact snippet. Almost every edit.
- `add_wiki_section` adds to the end, or to the start with `position:"start"`
  (a status banner, a summary above the notes). Pass `document_ids` to add the
  same content to up to 25 pages in one call; the result says which succeeded,
  so retry only the failures.
- `update_wiki_document` replaces the whole body. Read the page first and put
  back every construct you are not deliberately changing.

Copy `old_text` verbatim: whitespace, list markers and all. It must be unique;
if it occurs more than once the edit is refused with the count, and the fix is
to include a line either side, not `replace_all`. `replace_all` is for renaming
something throughout. A refusal says how the snippet differs (whitespace,
capitalisation, wrong page); read it before retrying.

Edits are applied on the live document, so the operator may be reading or
typing on the page you write to. Every write reports `watchers`; a non-zero
count means they saw it.

## What a page can contain

Pages are richer than plain markdown; preserve these constructs.

- **Checklist items** drive a coverage bar the operator watches:

  ````
  :::checklist {"prompt":"Enumerated SMB shares?","required":true,"state":"answered"}
  Three shares, one world-readable:

  ```text
  IPC$      no access
  Public    READ
  Backups   READ, WRITE
  ```
  :::
  ````

  The body is the answer; `state` is `answered`, `not_applicable`, `flagged`
  or absent. To answer one, edit the marker's `state` and write the body in one
  `edit_wiki_document` call. An operator reads the answer as written: put
  anything with more than one line (command output, a list of hosts, a
  config excerpt) in a fenced code block, one line per line, and keep the
  prose to a sentence above it. Never squash several lines into one.
- **Reference chips**: `[host](vibe://host/<id>)`, `[hash](vibe://hash/<id>)`,
  `[page](vibe://doc/<id>)`. Credentials appear as a `vibe-credential` fenced
  block.
- **Notices**: `:::info`, `:::success`, `:::warning`, `:::tip`, closed with `:::`.
- Attachments as `[name size](/api/v1/wiki/files/<id>)`.

## Templates

Check `list_wiki_templates` before writing a page from scratch. The listing
spans the operation's own templates and the shared ones in Public (marked
`shared`), which is usually where the house templates are. Create from one with
`create_wiki_document` and `template_id`; your `title` overrides the template's.

Pages carry `isTemplate`. Editing a template changes every page made from it
afterwards, and `set_wiki_template` is a team decision: propose it.

## Long content

Prose goes in the body, whole, in one call (up to 1 MB). Raw output (a command
history, a scan, a config, a dump) is evidence: attach it with
`attach_text_to_wiki_document` and link it from the page.
