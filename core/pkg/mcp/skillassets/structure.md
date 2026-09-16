# Wiki: where a page goes

The wiki is a tree, and the tree is the structure of the engagement. One page
holds one subject. A page that describes the whole infrastructure, every
subnet and every host in one body is the wrong shape: the operator cannot find
anything in it, two people's edits collide on it, and every read costs the
whole thing.

## Facts, not process

Before anything about shape: a page records what is **true about its
subject**. What the host runs, which credential opened it, what a finding
means, what was tried and did not work. It is read weeks later by somebody
who was not there and does not care how the knowing happened.

It is not a log of your working. Never grow a page that reads like this:

> Plan: enumerate the subnet. Now scanning. Found three hosts, so updating
> the plan. Next I will check SMB signing...

Every word of that belongs in the chat with the operator, where they can
steer you while it still matters. The page gets the outcome once there is
one: the three hosts as three pages, the signing result as a finding on each.

The test is whether a sentence is still worth reading tomorrow. "I am going
to check SMB signing" will not be. "SMB signing is disabled on dc01 and
fs01" will be. If a line only makes sense in the order you did things, it is
process — say it, do not write it.

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

- A host, a subnet, a web application, a user or group of interest, a finding
  write-up: each is its own page under the page for the thing that contains
  it. The parent is a short index of its children; the child holds the detail.
- Before creating a page, `list_wiki_tree` the branch it belongs to (a
  `search_wiki` for the hostname is quicker for one host). Add to the page
  that already covers the subject, or create a child of the nearest parent.
  Never a second page for a subject that has one.
- When notes you are adding turn into a second subject (a host section on a
  subnet page grows past a few lines), create the child page for it and leave
  a link on the parent: `[dc01](vibe://doc/<id>)`.
- A page cannot be moved to another parent afterwards, so choose the parent
  when you create it. Ask if the branch is unclear.
- Link across the tree with `vibe://doc/<id>` chips rather than repeating
  content: the host page links the finding that used its credentials; the
  finding links the hosts it touched. Link only what the page does not
  already show (below).

## What the operator already sees

The page is more than its body. Around it the UI shows:

- a breadcrumb of every ancestor, and the tree sidebar with the page's
  position and siblings;
- a footer listing its sub-pages, every page that links to it, and the tasks
  that reference it;
- a table of contents built from the headings and checklist items;
- who created and last edited it, and the checklist coverage bar.

So never write `Parent: [...]`, `Back to [...]`, a "Sub-pages" or "Related
pages" list of the children, "See also" back to a page that links here, or a
manual table of contents. Each duplicates a control the operator has, goes
stale when the tree changes, and buries the notes. A link in the body is for
a relation the tree does not express: the finding a host page came out of,
the host a credential opened, a page in another branch.
