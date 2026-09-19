# Drawings: reading and editing a canvas

Some wiki pages are drawings rather than prose — an Excalidraw canvas for
network maps, attack paths, infrastructure sketches. A drawing has no Markdown
body at all. `get_wiki_document` and the Markdown write tools refuse one, and
the drawing tools refuse a prose page; both refusals name the tool that works.

## Reading

`get_wiki_drawing` lists every shape with its id, kind, position and label.
Read before editing: edits address shapes by these ids. `view:"full"` returns
the complete element JSON and is rarely what you want — the default view is
what you compose edits from.

## Drawing

`edit_wiki_drawing` changes the canvas.

- `mode:"add"` (default) puts new shapes on it.
- `mode:"update"` changes existing shapes by id.
- `mode:"delete"` erases them, by `element_ids`.
- `mode:"replace"` swaps the whole scene in one transaction.

Elements are Excalidraw's own shape, and only `type` is required: `rectangle`,
`ellipse`, `diamond`, `text`, `arrow`, `line`, `freedraw`, `image`, `frame`.
Position, size, colour and the rest are optional and filled in for you.

Do not send `seed` or `versionNonce`. They are generated, and a fixed seed
makes every shape you draw wobble identically — visibly machine-made, in a
tool whose whole look is that it is not.

```json
{"type": "rectangle", "x": 100, "y": 200, "width": 160, "height": 80}
{"type": "text", "x": 120, "y": 230, "text": "Domain Controller"}
{"type": "arrow", "x": 260, "y": 240, "width": 140, "height": 0}
```

A labelled box is two elements, the way Excalidraw models it: the shape, and a
`text` element whose `containerId` is the shape's id. Without the
`containerId` the words are a note that happens to sit on top of a box, and
moving the box leaves them behind.

An arrow is drawn from its points, not its box. Give it `width`/`height` and
the points are derived; give explicit `points` when it should bend.

## Working alongside the operator

Edits land on the live canvas. They merge as the operator draws rather than
overwriting, and appear on their screen as they land — `watchers` on the
result says whether anyone was in fact looking.

An `update` or `delete` matching no shape changes nothing and says so, rather
than creating one. That almost always means the ids came from a read taken
before somebody else edited the canvas: read it again.

## Creating one

`create_wiki_document` with `kind:"drawing"`, then draw on it. Passing
`content` with that kind is refused — there is nowhere for Markdown to go on a
canvas.

Propose a drawing rather than assuming one: a diagram is a claim about how
something is laid out, and a wrong one is harder to correct than a wrong
paragraph.
