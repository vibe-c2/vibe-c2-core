# Workflows

How the common jobs fit together. None of these are mandatory — they are the
paths that avoid the mistakes.

## Orienting in an unfamiliar operation

1. `get_user_focus` — where is the operator? This usually settles which
   operation you are working in, and often what they are thinking about.
2. `get_operation_summary` — the shape of what is here. Cheap, and it stops you
   paging through findings that do not exist.
3. Only then go looking. If the summary says a count could not be read, treat
   that number as unknown rather than zero.

## Recording what you found

Findings hold the data; the wiki explains it. Both, not one.

- A host → `create_host`, **with** interfaces, routes and logins if you know
  them. Without those it cannot appear in the topology graph, which is where
  the operator will look for it.
- A recovered secret → `create_credential`. Not a wiki page. Tag it with the
  host it came from so it is findable later.
- A dump → `import_hashes`. It skips anything already recorded, so re-importing
  a grown dump is safe.
- A crack → `mark_hash_cracked`, not `update_hash` with status CRACKED. The
  first creates the credential and links it; the second records that the hash
  fell and leaves the plaintext nowhere.

Then write the page that says what it means: which hosts a credential reaches,
what that implies, what you would do next.

## Finding the right page, and reading only part of it

`search_wiki` returns a `snippet` of the matching text with every hit. Read the
snippets before opening anything — that is usually enough to tell which of five
plausible titles is the one you want, and opening the other four to find out is
the most common way to waste a context window here.

For a page you have chosen, you do not have to take all of it:

- `get_wiki_document` with `outline:true` returns the headings, their nesting,
  and the size of each section. A 40 KB page costs a few hundred bytes to
  survey.
- `get_wiki_document` with `section:"Hosts"` returns that heading and
  everything nested under it.

Section sizes include their children, so they do not sum to the page size — a
level-1 section reports the weight of everything beneath it. A full read of a
large page tells you the outline exists; you do not need to remember the
threshold.

Two things to hold on to:

- A section is **part** of the page. Change it with `edit_wiki_document`.
  Passing a section to `update_wiki_document` replaces the whole page with that
  fragment and deletes everything else.
- Section text is exact, so it is the cheapest source of `old_text` for the
  edit you are about to make.

## Before writing a page from scratch

Check `list_wiki_templates`. A template carries the structure the operator's
team already agreed on, and starting from one keeps your pages consistent with
theirs instead of introducing a second house style.

The listing spans the operation's own templates and the shared ones in the
Public wiki, which come back marked `shared`. Public is where a team keeps its
house templates, so it is often the only place there are any.
`create_wiki_document_from_template` copies one into your operation — including
a shared one, which is the normal way to use them. When no template fits,
`create_wiki_document` is correct.

Templates are shared conventions, so treat them as the operator's to change.
Pages carry `isTemplate`: check it before editing, because rewriting a template
changes every page made from it afterwards. `set_wiki_template` exists, but
propose it rather than deciding alone.

## What a page can contain

Pages are richer than plain markdown, and you read and write that richness as
markdown extensions. Preserve them. They are not decoration — the checklist
drives a coverage bar the operator watches, and every chip is a live link the
platform follows in both directions.

**Checklist items** — a question and its answer:

```
:::checklist {"prompt":"Enumerated SMB shares?","required":true,"state":"answered"}
Three shares, one world-readable.
:::
```

The body is the answer, and it takes any content, including chips. `prompt` is
the question, `required` says whether it must be answered, and `state` is
`answered`, `not_applicable`, `flagged`, or absent for unanswered. Answering a
question means putting content in the body — that is what the coverage bar
counts, so leave the marker line alone and write below it.

**Reference chips** — inline links to platform objects:

```
reached [host](vibe://host/<id>) with [hash](vibe://hash/<id>), see [page](vibe://doc/<id>)
```

Credentials are the exception: they come through as a `vibe-credential` fenced
block rather than an inline link.

**Notices** — `:::info`, `:::success`, `:::warning`, `:::tip`, closed with
`:::`.

Everything else is ordinary markdown: headings, tables, task lists
(`- [x]`), code fences, images, and file attachments as
`[name size](/api/v1/wiki/files/<id>)`.

## Changing a page

Four tools, and the first three cannot damage anything they were not aimed at:

- `edit_wiki_document` replaces an exact snippet. This is the tool for almost
  every edit.
- `append_wiki_section` adds to the end.
- `prepend_wiki_section` adds to the start — a status banner, a summary above
  existing notes. Reaching for `update_wiki_document` to put one line at the
  top is the expensive mistake it exists to prevent.
- `update_wiki_document` replaces the whole body. Read the page first and put
  back every construct you are not deliberately changing; a checklist you drop
  takes its answers and the operator's coverage with it.

An edit looks like this:

```
document_id: <id>
old_text:    "| dc-01 | unknown |"
new_text:    "| dc-01 | Windows Server 2019 |"
```

Copy `old_text` out of `get_wiki_document` verbatim — whitespace, list markers
and all. It has to match exactly and it has to be unique; if the snippet occurs
more than once the edit is refused with the count, and the fix is to include a
line or two either side rather than to pass `replace_all`. `replace_all` is for
when you genuinely mean every occurrence, like renaming a host throughout.

If it does not match, the refusal says how it differs — whitespace,
capitalisation, or that you are on the wrong page. Read it before retrying; it
is usually one character, and guessing costs another round trip.

To answer a checklist question, edit the marker line's `state` and put the
answer in the body — both in one call, with the item's own text as `old_text`.

**The same text on several pages.** `append_wiki_section` and
`prepend_wiki_section` take `document_ids` as well as `document_id`. One call,
content sent once, up to 25 pages. The result lists every page and whether it
was written, because some can fail while others succeed — retry only the
failures, or you will add the content twice to the pages that worked.

**The operator may be reading the page you are writing to.** That is fine and
it is the point. Edit, append and prepend all merge, so they cannot overwrite
what someone is typing. Every write reports `watchers`; if it is non-zero,
somebody saw it happen and you do not need to announce it.

## Putting something long on a page

A tool argument holds a megabyte. Whatever you are about to send, send it in
one call — never split a value across several calls with a placeholder to
stitch them together.

Where it goes depends on what it is:

- **Prose, notes, a write-up** — the page body.
- **Raw output — a command history, a scan, a config, a dump** — attach it with
  `attach_text_to_wiki_document` and link to it from the page. It is evidence,
  and evidence attaches. A page holding 20 KB of scrollback buries the
  reasoning that makes it useful. You can read it back with
  `read_wiki_attachment`.

If a body genuinely exceeds 1 MB you will be told so. The answer is still not
to split it — attach it.

## Reading what is attached to a page

A page's text is often a summary of something attached to it.
`list_wiki_attachments` shows what a page carries, and each entry says whether
you can read it, so you do not have to spend a call finding out.

`read_wiki_attachment` handles three shapes:

- **Already text** — `.txt`, `.csv`, `.md`, `.json`, `.log`, config and script
  files. Returned as-is. An LDAP dump or a DNS export is exactly the sort of
  thing worth correlating against hosts and credentials.
- **Word and Excel** — converted to plain text. You get the words and the cell
  values, not the layout.
- **Images** — returned as an image you can actually look at.

PDFs and other binaries are not readable. That is a real limit, not a transient
error: say so rather than retrying.

Long files come back truncated with a note. Treat what you have as the
beginning of the file and nothing more — summarising a truncated log as though
it were complete is worse than saying you only saw part of it.

## Giving a page an icon

Leave `emoji` and `icon` unset and the page gets an adaptive icon, which shows
as a page and becomes a folder once it has children. Most pages want exactly
that.

**Match what is already there.** Every listing returns each page's `emoji` and
`icon`, so one `list_wiki_tree` shows you the house style. If most rows have
neither, the convention is *not to set one*. A page that breaks the convention
looks like it came from somewhere else — which, from the operator's side, it
did.

When a page genuinely warrants a glyph, `icon` and `emoji` are mutually
exclusive and `icon` takes one of two forms:

- **A concept icon** — PascalCase from the platform's palette: `FileText`,
  `Folder`, `Server`, `Database`, `Network`, `Key`, `Lock`, `Shield`,
  `ShieldAlert`, `Bug`, `Terminal`, `Users`, `Target`, `Flag`, `Search`,
  `Wrench`, `Zap`, and so on.
- **A brand logo** — a simple-icons slug behind an `si:` prefix, lowercase:
  `si:linux`, `si:ubuntu`, `si:kalilinux`, `si:docker`, `si:kubernetes`,
  `si:nginx`, `si:postgresql`, `si:python`, `si:cisco`. Use one when a page is
  genuinely about that technology. There is **no Windows logo** — simple-icons
  does not ship one; use `Server` or an emoji.

A name outside the palettes is refused rather than ignored, so when unsure use
an emoji, or reuse whatever a comparable page already has. `color` is a hex
value that tints an icon and does nothing to an emoji.

## Suggesting work

`create_task` with an honest risk and profit score, and a description that says
why. A task is how you propose something without doing it.

Leave it unassigned unless you are about to work on it. An unassigned task is a
suggestion the operator can take or ignore; assigning it to them announces they
are doing it, which is their call. When you do start on something,
`assign_task_to_me` first, so the board shows who is on it.

When you finish, `change_task_stage` to DONE with a `status` and a `summary`
saying what actually happened — including when the answer was "nothing here". A
closed task with an empty summary teaches the next person nothing.

## Tasks do not stand alone

A task with no references is a sentence with the context cut off. Someone
reading the board later sees "Test credential reuse across the subnet" and has
to go and find, by hand, which credential and which notes that meant.

So whenever you create or touch a task, link:

- the **wiki pages** it comes out of, or that it will be written up on —
  `wiki_ids` on `create_task`, or `add_task_wiki_reference` afterwards;
- the **credentials** it depends on or is meant to produce — `credential_ids`
  on `create_task`, or `add_task_credential_reference` afterwards.

Both are idempotent, so linking something twice costs nothing and you never
have to check first.

Two habits that make this automatic:

- **Work backwards from what you just did.** You created a credential, then a
  task to use it: link the credential. The link is almost always something that
  was in front of you a moment ago.
- **Read the counts.** Every task view carries `wikiReferenceCount` and
  `credentialReferenceCount`. A zero on a task you are actively working is a
  prompt, not a fact about the world. `get_task` expands both lists with names
  so you can tell a wrong link from a missing one.

The reverse holds when you close a task: check that what it produced is linked.
A DONE task whose credential is not attached has lost the only durable pointer
between the work and its result.

## Whose tasks you can see

You work on one operator's behalf, not on the team's. So:

- Tasks **assigned to the operator you act for** are yours to read and change.
- **Unassigned** tasks are too — nobody has claimed them.
- Tasks **another operator has taken** are neither. `find_tasks` leaves them
  out, and reading or changing one by id is refused.

That is narrower than what the operator themselves can see. Handing you a key
is not the same as adding you to the team.

Two consequences worth expecting: a page of results can come back smaller than
you asked for, with a note saying how many were withheld — do not read that as
an empty board; and on a task shared between the operator and a colleague, you
may add or remove **only** the operator you act for.

## Picking an engagement back up

`get_timeline` for the days you were away, then `find_tasks` to see what moved.
Group what you report by theme rather than replaying the log line by line: the
operator wants to know where things stand, not the order events were recorded.
