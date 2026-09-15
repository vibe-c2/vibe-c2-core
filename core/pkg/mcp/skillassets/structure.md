# Wiki: where a page goes

The wiki is a tree, and the tree is the structure of the engagement. One page
holds one subject. A page that describes the whole infrastructure, every
subnet and every host in one body is the wrong shape: the operator cannot find
anything in it, two people's edits collide on it, and every read costs the
whole thing.

Build the hierarchy instead, with `parent_id` on `create_wiki_document`:

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
  content: the host page links its credentials and the finding that used
  them; the finding links the hosts it touched.
