# Wiki: where a page goes

The wiki is a tree, and the tree is the structure of the engagement. One page
holds one subject. A page with every subnet and every host in one body is the
wrong shape: nobody can find anything in it, edits collide on it, and every
read costs the whole thing.

## Facts, not process

Before anything about shape: a page records what is **true about its
subject**. What the host runs, which credential opened it, what a finding
means, what was tried and did not work. It is read weeks later, on another
machine, by somebody who was not there and does not care how the knowing
happened — so nothing on your own filesystem is a fact: a path like
`/tmp/scan.txt` records nothing for the person reading it.

It is not a log of your working. Never grow a page that reads like this:

> Plan: enumerate the subnet. Now scanning. Found three hosts, so updating
> the plan. Next I will check SMB signing...

Every word of that belongs in the chat with the operator, where they can steer
you while it still matters. The page gets the outcome once there is one: the
three hosts as three pages, the signing result as a finding on each.

The test is whether a sentence is still worth reading tomorrow. "I am going
to check SMB signing" will not be. "SMB signing is disabled on dc01 and fs01"
will be. If a line only makes sense in the order you did things, say it, do
not write it.

## Where a fact goes

The same rule inside a page. A new fact belongs in the section that already
covers its kind: a port found on Shodan goes in the services table with the
rest, noting the source if it matters. A second section named after the tool
you ran splits one subject in two, and the operator has to read both to know
what the host runs.

Read the headings first, then `edit_wiki_document` the section that owns the
subject. `add_wiki_section` is for a subject the page lacks; if that subject
will grow, it is a child page instead.

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

- A host, a subnet, a web application, a group of interest, a write-up: each
  is its own page under the thing that contains it. The parent
  is a short index of its children; the child holds the detail.
- Before creating a page, `list_wiki_tree` the branch it belongs to (for one
  host, `search_wiki` the hostname). Add to the page that already covers the
  subject, or create a child of the nearest parent. Never a second page for a
  subject that has one.
- When a section turns into a second subject (a host section on a subnet
  page grows past a few lines), make it a child page and link it from the
  parent: `[dc01](vibe://doc/<id>)`.
- `move_wiki_document` can reparent a page later, but the tree is how the
  operator navigates: choose the parent when you create it, and ask if the
  branch is unclear.
- Link across the tree with `vibe://doc/<id>` chips rather than repeating
  content: the host page links the finding that used its credentials. Link
  only what the page does not already show (below).

## What the operator already sees

The page is more than its body. Around it the UI shows:

- a breadcrumb of every ancestor, and the tree sidebar with the page's
  position and siblings;
- a footer listing its sub-pages, every page that links to it, and the tasks
  that reference it;
- a table of contents built from the headings and checklist items;
- who created and last edited it, and the checklist coverage bar.

So never write `Parent: [...]`, `Back to [...]`, a "Sub-pages" or "Related
pages" list, "See also" back to a page that links here, or a manual table of
contents. Each duplicates a control they already have and goes stale when the
tree changes. A link in the body is for a relation the tree does not express:
the finding a host page came out of, a page in another branch.
