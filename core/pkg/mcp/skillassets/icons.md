# Giving a page an icon

Leave `emoji` and `icon` unset and the page gets an adaptive icon: a page,
becoming a folder once it has children. Most pages want exactly that.

**Match what is already there.** Listings return each page's `emoji` and
`icon`; one `list_wiki_tree` shows the house style. If most rows have neither,
the convention is not to set one.

When a page warrants a glyph, `icon` and `emoji` are mutually exclusive and
`icon` takes one of two forms:

- **A concept icon**: any lucide icon, spelled PascalCase as lucide spells it.
  The common ones here are `FileText`, `Folder`, `Server`, `Database`,
  `Network`, `Key`, `Lock`, `Shield`, `ShieldAlert`, `Bug`, `Terminal`,
  `Users`, `Target`, `Flag`, `Search`, `Wrench`, `Zap`. Prefer one of those
  when it fits: the operator's pages are drawn from the same shortlist.
- **A brand logo**: any simple-icons slug behind `si:`, lowercase and
  unpunctuated — `si:linux`, `si:ubuntu`, `si:kalilinux`, `si:docker`,
  `si:kubernetes`, `si:nginx`, `si:postgresql`, `si:python`, `si:cisco`. The
  package ships no Microsoft or Windows mark; use `Server` or an emoji.

A refusal means the name is misspelled or invented, not that the icon is
unavailable: everything either package ships is accepted, and it is the same
set the operator's picker offers. Retry with the correct spelling rather than
settling for a different glyph. `color` is a hex value that tints an icon and
does nothing to an emoji.
