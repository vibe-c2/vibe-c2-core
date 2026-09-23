# Wiki: reading, editing, templates

## Finding the right page

`search_wiki` returns a `snippet` with every hit — read them before opening a
page. `list_wiki_tree` shows how the notes are organised: two levels by
default, `childCount` per page, `parent_id` to descend, `depth:-1` for all.

## Reading only part of a page

`get_wiki_document` returns a small page's body. A page over 8 KB comes back as
an **outline** (headings, nesting, bytes under each) unless you pass
`full:true`. From the outline:

- `section:"<heading>"` returns that heading and everything nested under it.
- Section sizes include children, so they do not sum to the page.
- Text above the first heading is in **no** section; only `full:true` reaches
  it (the outline reports its size as bytes above the first heading).
- A section is **part** of the page. Change it with `edit_wiki_document`;
  `update_wiki_document` would replace the page with the fragment.
- Section text is exact, so it is the cheapest source of `old_text`.

One read returns at most 40 KB. A longer body or section is cut and
`truncated` is set, with the byte offset to resume from on the last line:
repeat with that `offset:` (still `full:true`, or the same `section:`) until
`truncated` is false, then cross-check the bytes shown against the outline's
size.

## Changing a page

- `edit_wiki_document` replaces an exact snippet. Almost every edit.
- `add_wiki_section` adds to the end (or start with `position:"start"`) for a
  subject the page lacks; enrich one it has with `edit_wiki_document`.
  `document_ids` adds the same content to up to 25 pages at once; retry only
  the failures the result names.
- `update_wiki_document` replaces the whole body. Read the page first and put
  back every construct you are not changing.

Copy `old_text` verbatim, whitespace and list markers included. It must be
unique; if it repeats, add a line either side rather than `replace_all` (which
is for renaming throughout).

Edits are live; a write's `watchers` count says whether the operator saw it.

## Moving a page

`move_wiki_document` files a page under a different parent, with everything
below it; omit `parent_id` for the top level. Don't rebuild-and-trash instead:
that loses the page's history, attachments and links.

## Deleting a page

`delete_wiki_document` trashes a page (an admin can restore it). One with
children is refused unless you pass `with_children:true`; templates always.

## What a page can contain

Preserve these:

- **Checklist items** drive a coverage bar the operator watches:

  ````
  :::checklist {"prompt":"SMB shares enumerated?","state":"answered"}
  Two shares, one writable:

  ```text
  Backups  READ, WRITE
  ```
  :::
  ````

  The body is the answer; `state` is `answered`, `not_applicable`, `flagged`
  or absent. Edit the `state` and the body in one `edit_wiki_document` call;
  multi-line answers go in a fenced code block.
- **Reference chips**: `[host](vibe://host/<id>)`, `[hash](vibe://hash/<id>)`,
  `[page](vibe://doc/<id>)`.
- **A credential** is a block, not a link: no `vibe://credential/`, and not in
  a table cell. Fence it `vibe-credential` with a JSON body `{"id":"<uuid>"}`;
  invalid JSON (a bare uuid) stays an ordinary code block, silently.
- **Notices**: `:::info`, `:::success`, `:::warning`, `:::tip`, closed `:::`.
- Attachments as `[name bytes](/api/v1/wiki/files/<id>)` alone in a paragraph;
  `attach_text_to_wiki_document` returns the exact line.

## Templates

Check `list_wiki_templates` first. It spans this operation's templates and the
shared ones in Public (marked `shared`). Create from one with
`create_wiki_document` and `template_id`; your `title` wins.

Editing an `isTemplate` page changes every page made from it; `set_wiki_template`
is a team decision — propose it.

## Long content

Prose and evidence — a scan, a config, a log — go in the body whole, in one
call (up to 1 MB), in a fenced code block: it reads inline and stays
searchable. Attach a file only when it is a real file (JSON, CSV, PDF, image)
or would bury the page. See attachments.md.
