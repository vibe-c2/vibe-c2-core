# Drawings: reading and editing a canvas

Some wiki pages are an Excalidraw canvas rather than prose — network maps,
attack paths, infrastructure sketches. A drawing has no Markdown body, so the
Markdown tools refuse one and these refuse a prose page; both name the tool
that works.

A drawing is for the operator, not for you: they read a topology far faster
as a picture, while you read a canvas as a list of shapes. So draw when asked
and otherwise write the page — a diagram nobody asked for hands them shapes
when they wanted sentences.

Pages are marked: a row in `list_wiki_tree` or `search_wiki` carrying
`kind:"drawing"` is a canvas. Rows without it are prose.

## Reading

`get_wiki_drawing` lists every shape back-to-front: id, type, position, label,
layer, and for arrows their points and bindings. Read before editing — edits
address shapes by these ids, and the points are how you see two arrows drawn
on top of each other rather than side by side. Over 120 shapes it summarises.

## Drawing

`edit_wiki_drawing` changes the canvas.

- `mode:"add"` (default) puts new shapes on it.
- `mode:"update"` patches existing shapes by id: only the fields you send
  change, the rest is left alone. Send `label` to retitle a bound label.
- `mode:"delete"` erases them, by `element_ids`.
- `mode:"replace"` swaps the whole scene in one transaction.

Elements are Excalidraw's own shape; only `type` is required: `rectangle`,
`ellipse`, `diamond`, `text`, `arrow`, `line`, `freedraw`, `image`, `frame`.
A labelled shape is sized to fit its label, so give `width` only when you want
a particular one — and make it big enough. Never send `seed` or
`versionNonce`.

```json
{"type":"rectangle","id":"dc","x":100,"y":200,"label":"Domain Controller"}
{"type":"rectangle","id":"jump","x":400,"y":200,"label":"Jump host"}
{"type":"arrow","startBinding":"dc","endBinding":"jump","z":-1}
```

**Label a shape with `label`.** Excalidraw models a labelled box as a shape
plus a `text` whose `containerId` names it, holding only if the shape lists
the text back. `label` builds and wires both; by hand, wire both halves or the
words stay behind when the box moves.

**Connect arrows with `startBinding` / `endBinding`,** each the id of the
shape to attach to. Two things follow, easily confused:

- It glues the ends, so the arrow follows those shapes when somebody drags
  them. An unbound arrow is decoration and falls behind on first edit.
- Give a bound arrow no `points` and the server draws a straight stroke
  between the two shapes' edges. That is the easy way to draw a tree: name the
  ends, send no geometry.

It is not a routing engine: a straight line, nothing avoiding siblings. Send
`points` for an elbow.

An arrow is drawn from its points, not its box, and identical points draw
identical strokes: twenty arrows sharing geometry are one visible line and a
result saying `applied: 20`. The response warns when shapes land exactly on
top of each other; the habit that avoids it is to let bindings place them.

Coordinates grow right and down, with no canvas edge. A shape at x: 3000 is
real and off the screen of anyone at the origin, so an empty-looking canvas is
worth a read before a redraw.

**Layer with `z`** — higher covers lower. Hand-drawn shapes sit at 0, so
`z: -1` puts your arrows under their boxes. Shapes sent without one stack on
top in the order you sent them. Reads come back back-to-front, so the list is
the layering.

## Working alongside the operator

Edits merge as the operator draws and appear on their screen as they land.
`watchers` says whether anyone was looking.

When a layout has gone wrong in several places, `mode:"replace"` with the
whole scene beats a run of patches: one coherent change rather than a sequence
that must be right about its starting state each time. Replace means "this is
the entire canvas now" — anything left out is gone.

An `update` or `delete` matching no shape changes nothing and says so rather
than creating one — usually stale ids. Read it again.

Create one with `create_wiki_document` and `kind:"drawing"`.
