# Attachments

A page's text is often a summary of something attached to it.
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

`attach_text_to_wiki_document` adds text as a file: raw output, a scan, a
config, anything long enough that pasting it into the page would bury the
notes. Whole content, one call; the cap is megabytes.

Attaching stores the file; it does not put it on the page. The result carries
`markdown`, the line that does:

```
[nmap-full.txt 18422](/api/v1/wiki/files/<id>)
```

Paste that line as written, alone in its own paragraph (a blank line above and
below), wherever the file belongs: under the heading it supports, or inside the
checklist answer it is evidence for. The editor shows it as an attachment card
with the name and size. The card depends on the exact shape: the byte count
after the name, nothing else in the paragraph. `Full output: [nmap-full.txt](…)`
is only a link, and a label without the byte count shows as 0 B. To place a
file that is already on the page, take `markdown` from `list_wiki_attachments`.

You cannot tell a card from a link by reading the page back: both come back
as the same markdown. Two things tell you instead. Every write reports
`attachmentCards` and, when a file link stayed plain text,
`fileLinksNotPlaced` with its label and file id: fix it in the same turn with
`edit_wiki_document`, moving the link onto a line of its own. And
`list_wiki_attachments` marks each file `placed` or not, from the saved page,
so it can lag a write by a few seconds.

## Screenshots and other binary files

Send raw bytes to the upload endpoint with the same bearer token you use
for MCP; it is the multipart form of `attach_file_to_wiki_document`, audited
under that name, and returns the same result:

```
curl -X POST $HOST/api/v1/mcp/upload -H "Authorization: Bearer vca_..." \
  -F documentId=<page id> -F as=image -F file=@login.png
```

Fields: `documentId`, `file` (the filename travels with it), and `as`. Use
the tool with `content_base64` only when you cannot make an HTTP request
yourself: base64 costs a third more and a copy on each side. Two placements:

- `as:"image"` for a screenshot (PNG, JPEG, GIF, WebP): the page shows it as a
  picture. The result's `markdown` is an image line with a size hint,
  `![login.png](/api/v1/wiki/images/<id> " =1280x720")`; paste it alone on
  its own line where the picture belongs.
- `as:"attachment"` (default) for anything else, a capture or a binary: a
  file card, placed exactly like a text attachment.

Whole file, one call. The page's upload limits apply and a refusal says which.
