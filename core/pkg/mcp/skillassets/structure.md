# Wiki: where a page goes

The wiki is a tree, and the tree is the structure of the engagement. One page
holds one subject. A page with every subnet and host in one body is the wrong
shape: nobody can find anything in it, edits collide, and every read costs
the whole thing.

## Facts, not process

Before anything about shape: a page records what is **true about its
subject**. What the host runs, which credential opened it, what a finding
means, what was tried and did not work. It is read weeks later by somebody
who was not there and does not care how the knowing happened.

Do not date the knowing either. "Collected 2026-09-19 from public sources"
is a sentence about you, and it becomes a lie the first time somebody adds a
line under it — which is what these pages are for. Date something only when
the date is the fact: when a certificate expires, when a password was set.

It is not a log of your working. Never grow a page that reads like this:

> Plan: enumerate the subnet. Now scanning. Found three hosts, so updating
> the plan. Next I will check SMB signing...

That belongs in the chat with the operator, where they can steer you while it
still matters. The page gets the outcome once there is one: the three hosts
as three pages, the signing result as a finding on each.

The test is whether a sentence is still worth reading next month. "I am going
to check SMB signing" is not; "SMB signing is disabled on dc01 and fs01" is.
If a line only makes sense in the order you did things, say it, do not write
it.

## Where a fact goes

The same rule inside a page. A new fact belongs in the section that already
covers its kind: a port found on Shodan goes in the services table with the
rest, noting the source if it matters. A second section named after the tool
you ran splits one subject in two, and the operator must read both to know
what the host runs.

Read the headings first, then `edit_wiki_document` the section that owns the
subject. `add_wiki_section` is for a subject the page lacks; if it will grow,
make it a child page.

## Where a page goes

Build the hierarchy with `parent_id` on `create_wiki_document`:

```
Infrastructure
├── 10.0.10.0/24 (servers)
│   ├── dc01.corp.local
│   └── fs01.corp.local
└── 10.0.20.0/24 (workstations)
    └── ws-042
Web applications
├── portal.corp.example
└── api.corp.example
```

- A host, a subnet, a web app, a group of interest, a write-up: each is its
  own page under the thing that contains it. The parent indexes its children;
  the child holds the detail.
- Before creating a page, `list_wiki_tree` the branch it belongs to (for one
  host, `search_wiki` the hostname). Add to the page that already covers the
  subject, or create a child of the nearest parent — never a second page for
  a subject that has one.
- When a section turns into a second subject (a host section on a subnet page
  grows past a few lines), make it a child page and link it from the parent:
  `[dc01](vibe://doc/<id>)`.
- `move_wiki_document` reparents a page later, but the tree is how the
  operator navigates: choose the parent up front, and ask if it is unclear.
- Link across the tree with `vibe://doc/<id>` chips rather than repeating
  content: the host page links the finding that used its credentials. Link
  only what the page does not already show (below).


## What the operator already sees

The page is more than its body. Around it the UI shows:

a breadcrumb and the tree sidebar (ancestors, position, siblings); a footer
of sub-pages, inbound links and referring tasks; a table of contents from the
headings; the checklist coverage bar; who created and last edited it, and
when.

So never write `Parent: [...]`, `Back to [...]`, a "Sub-pages" or "Related
pages" list, "See also" back to a page that links here, a manual table of
contents, or the date you wrote something. Each duplicates a control they
have and goes stale when the tree changes. A link in the body is for a relation the tree does not express:
the finding a host page came out of, a page in another branch.
