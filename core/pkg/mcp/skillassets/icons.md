# Giving a page an icon

Leave `emoji` and `icon` unset and the page gets an adaptive icon: a page,
becoming a folder once it has children. Most pages want exactly that.

**Match what is already there.** Listings return each page's `emoji` and
`icon`; one `list_wiki_tree` shows the house style. If most rows have neither,
the convention is not to set one.

When a page warrants a glyph, `icon` and `emoji` are mutually exclusive and
`icon` takes one of two forms:

- **A concept icon**, PascalCase from the platform's palette: `FileText`,
  `Folder`, `Server`, `Database`, `Network`, `Key`, `Lock`, `Shield`,
  `ShieldAlert`, `Bug`, `Terminal`, `Users`, `Target`, `Flag`, `Search`,
  `Wrench`, `Zap`.
- **A brand logo**, a simple-icons slug behind `si:`: `si:linux`, `si:ubuntu`,
  `si:kalilinux`, `si:docker`, `si:kubernetes`, `si:nginx`, `si:postgresql`,
  `si:python`, `si:cisco`. There is no Windows logo; use `Server` or an emoji.

A name outside the palettes is refused. When unsure, use an emoji or reuse what
a comparable page has. `color` is a hex value that tints an icon and does
nothing to an emoji.
