# Wiki: reading, editing, templates

## Finding the right page

`search_wiki` returns a `snippet` with every hit. Read the snippets before
opening anything; opening wrong pages wastes the context window.
`list_wiki_tree` shows how the notes are organised: two levels by default with
a `childCount` per page, `parent_id` to descend, `depth:-1` for everything.

## Reading only part of a page

`get_wiki_document` returns the body of a small page. A page over 8 KB comes
back as an **outline** (headings, nesting, bytes under each) unless you pass
`full:true`. Then:

- `section:"<heading>"` returns that heading and everything nested under it.
- Section sizes include their children, so they do not sum to the page.
- A section is **part** of the page. Change it with `edit_wiki_document`.
  Passing it to `update_wiki_document` replaces the page with the fragment.
- Section text is exact, so it is the cheapest source of `old_text`.

## Changing a page

- `edit_wiki_document` replaces an exact snippet. Almost every edit.
- `add_wiki_section` adds to the end, or to the start with `position:"start"`,
  for a subject the page lacks; enrich one it already has with
  `edit_wiki_document` instead. Pass `document_ids` to add the same content to up to 25 pages in one call;
  the result says which succeeded, so retry only the failures.
- `update_wiki_document` replaces the whole body. Read the page first and put
  back every construct you are not changing.

Copy `old_text` verbatim: whitespace, list markers and all. It must be unique;
if it occurs more than once the fix is a line either side, not `replace_all`,
which is for renaming throughout. A refusal says how it differs.

Edits land on the live document; every write reports `watchers`, and a
non-zero count means the operator saw it.

## Moving a page

`move_wiki_document` files a page under a different parent, with everything
below it; omit `parent_id` for the top level. Never rebuild a page somewhere
else and trash the original: that loses its history, its attachments and
every link to it.

## Deleting a page

`delete_wiki_document` moves a page to the trash, where an admin can restore
it. A page with children is refused until you pass `with_children:true`.
Templates are refused.

## What a page can contain

Pages are richer than markdown; preserve these constructs.

- **Checklist items** drive a coverage bar the operator watches:

  ````
  :::checklist {"prompt":"Enumerated SMB shares?","required":true,"state":"answered"}
  Two shares, one writable:

  ```text
  IPC$      no access
  Backups   READ, WRITE
  ```
  :::
  ````

  The body is the answer; `state` is `answered`, `not_applicable`, `flagged`
  or absent. To answer one, edit the marker's `state` and write the body in one
  `edit_wiki_document` call. The operator reads the answer as written:
  anything multi-line goes in a fenced code block, never squashed into a line.
- **Reference chips**: `[host](vibe://host/<id>)`, `[hash](vibe://hash/<id>)`,
  `[page](vibe://doc/<id>)`. Credentials appear as a `vibe-credential` fenced
  block.
- **Notices**: `:::info`, `:::success`, `:::warning`, `:::tip`, closed with `:::`.
- Attachments as `[name bytes](/api/v1/wiki/files/<id>)` alone in a
  paragraph; `attach_text_to_wiki_document` returns the exact line.

## Templates

Check `list_wiki_templates` before writing a page from scratch. It spans the
operation's own templates and the shared ones in Public (marked `shared`).
Create from one with `create_wiki_document` and `template_id`; your `title`
overrides the template's.

Pages carry `isTemplate`. Editing one changes every page made from it
afterwards, and `set_wiki_template` is a team decision: propose it.

## Long content

Prose goes in the body, whole, in one call (up to 1 MB). So does evidence: a
scan, a config, a log belongs in a fenced code block, however many lines it
runs to. A code block reads inline and is searchable; an attachment is
neither. Attach a file only when it is one (JSON, CSV, a PDF, an image), or
when text is so long it would bury the page. See attachments.md.
