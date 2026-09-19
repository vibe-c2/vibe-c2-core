# Drawings: reading and editing a canvas

Some wiki pages are drawings rather than prose — an Excalidraw canvas for
network maps, attack paths, infrastructure sketches. A drawing has no Markdown
body at all. `get_wiki_document` and the Markdown write tools refuse one, and
the drawing tools refuse a prose page; both refusals name the tool that works.

A drawing is for the operator, not for you. A topology, an attack path, a
sequence of hops — a person reads those far faster as a picture than as
paragraphs, which is the whole reason the page kind exists. You gain nothing
from it: you read a canvas as a list of shapes, and prose you can search,
quote and edit precisely.

So draw when the operator asks for a drawing, and otherwise write the page.
Do not turn notes into a diagram because it seems helpful: a diagram is a
claim about how something is laid out, it is harder to correct than a
paragraph, and an operator who wanted prose now has to read shapes.

Pages are marked: a row in `list_wiki_tree` or `search_wiki` carrying
`kind:"drawing"` is a canvas. Rows without it are prose.

## Reading

`get_wiki_drawing` lists every shape with its id, kind, position and label.
Read before editing: edits address shapes by these ids. Over 120 shapes it
returns a summary instead — counts by type plus every label, because a diagram
is navigated by its words. `view:"full"` returns the complete element JSON and
is rarely what you want.

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
{"type": "rectangle", "id": "dc", "x": 100, "y": 200, "width": 160,
 "height": 80, "label": "Domain Controller"}
{"type": "rectangle", "id": "jump", "x": 400, "y": 200, "label": "Jump host"}
{"type": "arrow", "x": 270, "y": 240, "width": 120, "height": 0,
 "startBinding": "dc", "endBinding": "jump"}
```

**Label a shape with `label`.** Excalidraw models a labelled box as two
elements — the shape plus a `text` whose `containerId` names it — and the pair
only holds together if the shape lists the text back. `label` builds both and
wires them. Writing the text element yourself still works; wire both halves if
you do, or the words stay behind the first time somebody drags the box.

**Connect arrows with `startBinding` / `endBinding`,** each the id of the
shape to attach to. An unbound arrow is decoration: it sits where you put it
and does not follow the shapes when they move, so a diagram that looked right
falls apart the first time it is edited. `focus` and `gap` are filled in.

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
