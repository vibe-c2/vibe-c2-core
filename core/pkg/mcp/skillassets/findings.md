# Findings: hosts, credentials, hashes

Findings hold the data; the wiki explains it. Record both.

## Orienting

1. `get_user_focus` settles which operation you are in, what the operator is
   looking at, and its shape in numbers. A count that could not be read is
   unknown, not zero. `get_operation_summary` gives the same counts for an
   operation that is not in focus.
2. Only then go looking.

## Recording

- **A host**: `create_host` with interfaces, routes and logins where known.
  Without them it cannot appear on the topology graph. `update_host` REPLACES
  those lists, so read the host first and send the full set. `description` is
  what the machine is to the engagement — the domain controller holding the
  PKI role, the jump box the team pivots through. `os` is the fingerprint and
  nothing else: "Windows Server 2019", not "Windows Server 2019, DC, holds
  PKI". The operator sorts and filters on `os`, so a sentence in it sorts
  under nothing.
- **A recovered secret**: `create_credential`, tagged with the host it came
  from. Not a wiki page. `validity` stays UNKNOWN until somebody tries it:
  say VALID once you have used it, INVALID once the target refused it. Never
  claim VALID for one you merely found — UNKNOWN is a real answer and nothing
  hides it.
- **A correction**: `update_credential` changes only the fields you send and
  leaves the rest alone. `keys`, `properties` and `tags` are the exception —
  sending one replaces that whole list, and sending `[]` clears it.
- **A dump**: `import_hashes`. Known hashes are skipped, so re-importing a
  grown dump is safe.
- **A crack**: `mark_hash_cracked`, which creates and links the credential.
  `update_hash` with status CRACKED records the outcome and leaves the
  plaintext nowhere.
- **Hash listings clip long values**; `get_hash` returns one whole. Filter on
  `status` rather than paging through everything.

Then write the page that says what it means: which hosts a credential reaches,
what that implies, what you would do next.

## Putting a credential on a page

Never retype the secret. Reference the record, so the page keeps showing its
current username, validity and comments:

````
```vibe-credential
{"id": "<credential-uuid>"}
```
````

Three things that look right and are not:

- **A bare uuid in the fence.** The body must parse as JSON with a string
  `id`. Anything else stays an ordinary code block: no error, and it looks
  right in the markdown you sent.
- **`[credential](vibe://credential/<id>)`.** That scheme covers hosts,
  hashes and pages only; for a credential it renders as a plain link.
- **A credential in a table.** The fence is a block and cannot sit in a cell.
  Put those rows in prose, or list the credentials under the table.

Copy a fence off another page only after checking it renders there; a broken
one propagates.

## Milestones on the timeline

The timeline is the engagement's shared history and it is deliberately
sparse: milestones, not activity. Some land on their own — closing a task,
recording a credential, marking a hash cracked. Everything else that changed
the shape of the engagement is yours to record with `create_timeline_event`:

- a host or a domain controller owned;
- a foothold gained or lost, a persistence mechanism planted;
- a target changed, such as a login form patched or a config altered;
- a credential that opened a new network segment or a new tier;
- a detection, a lockout, or anything the operator would want to see on the
  history without reading the notes.

Name it the way the timeline is read later: "Owned DC01 via GPO abuse", not
"progress". Put the detail in `description`, link the write-up from the wiki,
and use `occurred_at` when the event happened earlier than now. Do not record
routine work: reads, wiki edits and task bookkeeping are not milestones.

## Picking an engagement back up

`get_timeline` for the days you were away, then `find_tasks` for what moved.
Report by theme rather than replaying the log line by line.
