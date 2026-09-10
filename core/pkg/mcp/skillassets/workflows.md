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

## Giving a page an icon

The default is deliberate: leave `emoji` and `icon` unset and the page gets an
adaptive icon, which shows as a page and becomes a folder on its own once it has
children. Most pages want exactly that.

When a page genuinely warrants its own glyph, you have two options and they are
mutually exclusive:

- **`icon`** — a PascalCase name from the platform's palette, the same set the
  operator's own picker offers: `FileText`, `Folder`, `Server`, `Database`,
  `Network`, `Key`, `Lock`, `Shield`, `ShieldAlert`, `Bug`, `Terminal`,
  `Users`, `Target`, `Flag`, `Search`, `Wrench`, `Zap`, and so on. A name
  outside the palette is refused rather than quietly ignored, so if you are
  unsure, use an emoji instead.
- **`emoji`** — any single emoji. Always valid, and the right escape hatch when
  nothing in the palette fits.

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

When you finish a piece of work, `change_task_stage` to DONE with a `status` and
a `summary` saying what actually happened — including when the answer was
"nothing here". A closed task with an empty summary teaches the next person
nothing.

## Picking an engagement back up

`get_timeline` for the days you were away, then `find_tasks` to see what moved.
Group what you report by theme rather than replaying the log line by line: the
operator wants to know where things stand, not the order events were recorded.
