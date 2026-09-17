# Attachments

`list_wiki_attachments` shows what a page carries and whether each file is
readable, so you do not spend a call finding out.

`read_wiki_attachment` handles three shapes:

- **Text** (`.txt`, `.csv`, `.md`, `.json`, `.log`, configs, scripts):
  returned as-is.
- **Word and Excel**: converted to plain text; words and cell values, no
  layout.
- **Images**: returned as an image you can look at.

PDFs and other binaries are not readable. That is a limit, not a transient
error. Long files come back truncated with a note: treat what you have as the
beginning of the file, never as the whole.

## Adding a file

**Text usually does not want to be a file.** Command output, a config
excerpt, a log extract: put it in a fenced code block in the page, however
many lines it runs to. A code block reads inline and is searchable; an
attachment is stored as bytes, so only its filename is indexed and nothing
inside it can be found.

`attach_text_to_wiki_document` is for the rest: a real file format somebody
would open on its own (JSON, YAML, CSV), or a dump so long it would bury the
page — thousands of lines, not dozens. Whole content, one call; the cap is
megabytes.

Attaching stores the file; it does not put it on the page. The result carries
`markdown`, the line that does:

```
[nmap-full.txt 18422](/api/v1/wiki/files/<id>)
```

Paste that line as written, alone in its own paragraph (a blank line above and
below), wherever the file belongs. The card depends on that exact shape: the
byte count after the name, nothing else in the paragraph.
`Full output: [nmap-full.txt](…)` is only a link, and a label without the byte
count shows as 0 B. To place a file already on the page, take `markdown` from
`list_wiki_attachments`.

You cannot tell a card from a link by reading the page back: both come back
as the same markdown. Two things tell you instead. Every write reports
`attachmentCards` and, when a file link stayed plain text,
`fileLinksNotPlaced` with its label and file id: fix it in the same turn with
`edit_wiki_document`, moving the link onto a line of its own. And
`list_wiki_attachments` marks each file `placed` or not, from the saved page,
so it can lag a write by a few seconds.

## Screenshots and other binary files

Send raw bytes to the upload endpoint; it is the multipart form of
`attach_file_to_wiki_document`, audited under that name, and returns the same
result:

```
curl -X POST $URL/api/v1/mcp/upload -H "Authorization: Bearer $TOKEN" \
  -F documentId=<page id> -F as=image -F file=@login.png
```

**Read the URL and token out of your MCP client's config now. Never use ones
you remember.** They are the server address and `Authorization` header
configured for this connection, in `.mcp.json`, `.cursor/mcp.json` or your
client's equivalent. A token belongs to one server, and a machine used on
several projects has several: the one in your head is probably last project's.

A `401` means exactly that — stale or foreign token. Re-read the config and
retry. It does not mean the endpoint is unavailable, and it is not a reason to
fall back to base64.

Fields: `documentId`, `file` (the filename travels with it), `as` and
`place`. Use the tool with `content_base64` only when you genuinely cannot
make an HTTP request: base64 costs a third more and a copy on each side.

- `as:"image"` for a screenshot (PNG, JPEG, GIF, WebP): the page shows it as a
  picture. `as:"attachment"` (default) for anything else, a capture or a
  binary: a file card, like a text attachment.
- `place` says where on the page: `end` (default) or `start`. The upload
  is on the page when the call returns; the result says `placed: true`.
  Pass `place:"none"` only when the picture belongs at a specific spot:
  then take the result's `markdown` line and put it there with
  `edit_wiki_document`, alone on its own line, in the same turn. An image
  no page references is garbage-collected, so never leave one unplaced.

Whole file, one call. The page's upload limits apply and a refusal says which.
