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

`attach_text_to_wiki_document` adds text as a file: raw output, a scan, a
config, anything long enough that pasting it into the page would bury the
notes. Whole content, one call; the cap is megabytes. Link it from the page.
