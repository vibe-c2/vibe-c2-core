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

## Before writing a page from scratch

Check `list_wiki_templates` first. A template carries the structure the
operator's team already agreed on — what sections a host write-up has, what a
finding needs to record — and starting from one keeps your pages consistent
with theirs instead of introducing a second house style.

`create_wiki_document_from_template` copies that structure and content into a
new page; fill in the sections afterwards with `append_wiki_section` or
`update_wiki_document`. When no template fits, `create_wiki_document` is
correct — an operation with none is common, and the tool says so rather than
leaving you guessing.

Templates themselves are shared conventions, so treat them as the operator's to
change:

- Pages carry `isTemplate`. Check it before editing. Rewriting a template
  silently changes every page made from it afterwards, which is rarely what
  anyone asked for.
- `set_wiki_template` exists, but propose it rather than deciding alone.
  Promoting your own page to a template is a claim about how the whole team
  should work.

## Reading what is attached to a page

A page's text is often a summary of something attached to it — a scan export,
a spreadsheet of accounts, a screenshot of a console. `list_wiki_attachments`
shows what a page carries, and each entry says whether you can read it, so you
do not have to spend a call finding out.

`read_wiki_attachment` handles three shapes:

- **Already text** — `.txt`, `.csv`, `.md`, `.json`, `.log`, config and script
  files. Returned as-is. An LDAP dump or a DNS export is exactly the sort of
  thing worth correlating against hosts and credentials.
- **Word and Excel** — converted to plain text. You get the words and the cell
  values, not the layout.
- **Images** — returned as an image you can actually look at. Useful for
  screenshots and network diagrams.

PDFs and other binaries are not readable. That is a real limit, not a
transient error: say so rather than retrying.

Long files come back truncated with a note. When you see it, treat what you
have as the beginning of the file and nothing more — summarising a truncated
log as though it were complete is worse than saying you only saw part of it.

## Giving a page an icon

The default is deliberate: leave `emoji` and `icon` unset and the page gets an
adaptive icon, which shows as a page and becomes a folder on its own once it has
children. Most pages want exactly that.

When a page genuinely warrants its own glyph, `icon` and `emoji` are mutually
exclusive and `icon` takes one of two forms:

- **A concept icon** — a PascalCase name from the platform's palette, the same
  set the operator's own picker offers: `FileText`, `Folder`, `Server`,
  `Database`, `Network`, `Key`, `Lock`, `Shield`, `ShieldAlert`, `Bug`,
  `Terminal`, `Users`, `Target`, `Flag`, `Search`, `Wrench`, `Zap`, and so on.
- **A brand logo** — a simple-icons slug behind an `si:` prefix, lowercase:
  `si:linux`, `si:ubuntu`, `si:debian`, `si:kalilinux`, `si:docker`,
  `si:kubernetes`, `si:nginx`, `si:postgresql`, `si:python`, `si:git`,
  `si:wireshark`, `si:openvpn`, `si:cisco`. Reach for one when a page is
  genuinely about that technology — a host running Alpine, notes on a
  Kubernetes cluster.

  There is **no Windows logo**: simple-icons does not ship one. For a Windows
  host use a concept icon such as `Server`, or an emoji.

- **`emoji`** — any single emoji. Always valid, and the right escape hatch when
  nothing in either palette fits.

A name outside the palettes is refused rather than quietly ignored, so if you
are unsure, use an emoji.

`color` is a hex value that tints an icon. It does nothing to an emoji.

Pick for recognition, not decoration. An icon earns its place when an operator
scanning the tree would find the page faster because of it.

## Working alongside someone

The operator may be reading the page you are writing to. That is fine and it is
the point.

- `append_wiki_section` merges. It cannot overwrite what they are typing, and
  they will watch your text appear.
- `update_wiki_document` replaces the whole body, so read the page first and
  send back everything you intend to keep.
- Both tools report `watchers`. If it is non-zero, someone saw it happen and
  you do not need to announce it.

## Suggesting work

`create_task` with an honest risk and profit score, and a description that says
why. A task is how you propose something without doing it.

Link it at the same time. `create_task` takes `wiki_ids` and `credential_ids`,
and the moment you are writing the task is the moment you still know what it
came out of — see "Tasks do not stand alone" below.

Leave it unassigned unless you are about to work on it. An unassigned task is a
suggestion the operator can take or ignore; assigning it to them announces they
are doing it, which is their call and not yours. When you do start on
something, `assign_task_to_me` first, so the board shows who is on it.

When you finish a piece of work, `change_task_stage` to DONE with a `status` and
a `summary` saying what actually happened — including when the answer was
"nothing here". A closed task with an empty summary teaches the next person
nothing.

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
  task to use it: link the credential. You wrote a page about a host, then a
  task to go further on it: link the page. The link is almost always something
  that was in front of you a moment ago.
- **Read the counts.** Every task view carries `wikiReferenceCount` and
  `credentialReferenceCount`. A zero on a task you are actively working is a
  prompt, not a fact about the world. `get_task` expands both lists with names
  so you can tell a wrong link from a missing one.

The reverse holds too: when you close a task with `change_task_stage`, check
that what it produced is linked. A DONE task whose credential is not attached
has lost the only durable pointer between the work and its result.

## Whose tasks you can see

You work on one operator's behalf, not on the team's. So:

- Tasks **assigned to the operator you act for** are yours to read and change.
- **Unassigned** tasks are too — nobody has claimed them.
- Tasks **another operator has taken** are neither. `find_tasks` leaves them
  out, and reading or changing one by id is refused.

That is narrower than what the operator themselves can see: they can read the
whole board, because it is shared. Handing you a key is not the same as adding
you to the team, so their colleagues' work stays theirs.

Two consequences worth expecting:

- A page of results can come back smaller than you asked for, with a note
  saying how many were withheld. Do not read that as an empty board.
- On a task shared between the operator and a colleague, you may add or remove
  **only** the operator you act for. The colleague's claim stays put.

## Picking an engagement back up

`get_timeline` for the days you were away, then `find_tasks` to see what moved.
Group what you report by theme rather than replaying the log line by line: the
operator wants to know where things stand, not the order events were recorded.
