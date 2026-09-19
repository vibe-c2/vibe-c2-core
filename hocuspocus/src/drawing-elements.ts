// Turn what an agent sends into a real Excalidraw element.
//
// The agent-facing contract is Excalidraw's own element shape — no invented
// DSL, no diagram language to learn or document. But a genuine element carries
// about twenty-five fields, most of which are bookkeeping (`seed`,
// `versionNonce`, `groupIds`, `roundness`) that nobody composing a diagram
// should have to think about and that a model will get wrong or omit. So every
// field but `type` is optional here, and the defaults are filled in.
//
// Validation is strict about the things that cannot be recovered from — an
// unknown type, a non-finite coordinate — and lenient about everything else. A
// rejected call costs the agent a round trip and tells it what to fix; a
// silently-accepted bad element becomes an invisible shape on somebody's
// canvas that neither of them can explain.

const SHAPE_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "text",
  "arrow",
  "line",
  "freedraw",
  "image",
  "frame",
]);

/** Excalidraw's own defaults, so an agent-drawn shape looks like a hand-drawn
 * one rather than announcing itself as machine-made. */
const DEFAULTS = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  fontSize: 20,
  // 5 is Excalifont, Excalidraw's hand-drawn face and its own default.
  fontFamily: 5,
  textAlign: "left",
  verticalAlign: "top",
} as const;

export interface NormalizedElement {
  [key: string]: unknown;
  id: string;
  type: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
}

/** One end of an arrow, once normalized. */
interface ElementBinding {
  elementId: string;
  focus: number;
  gap: number;
}

/**
 * Accept a binding as either Excalidraw's own object or the bare id of the
 * shape to bind to, and fill the rest.
 *
 * `focus` and `gap` are geometry Excalidraw recomputes as soon as anything
 * moves; requiring a caller to invent them is asking for numbers that are
 * wrong the moment they are used. 0 means "aim at the centre", which is what
 * dragging an arrow onto a shape produces.
 */
function binding(value: unknown): ElementBinding | null {
  if (typeof value === "string" && value !== "") {
    return { elementId: value, focus: 0, gap: 4 };
  }
  if (typeof value === "object" && value !== null) {
    const v = value as Record<string, unknown>;
    if (typeof v.elementId === "string" && v.elementId !== "") {
      return {
        elementId: v.elementId,
        focus: typeof v.focus === "number" ? v.focus : 0,
        gap: typeof v.gap === "number" ? v.gap : 4,
      };
    }
  }
  return null;
}

export class DrawingElementError extends Error {}

function randomInteger(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function randomID(): string {
  // Excalidraw ids are opaque; any stable unique string works. Hex keeps them
  // recognisable alongside the ones it mints itself.
  return Array.from({ length: 5 }, () =>
    randomInteger().toString(16).padStart(8, "0"),
  )
    .join("")
    .slice(0, 36);
}

function num(value: unknown, fallback: number, field: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DrawingElementError(
      `${field} must be a finite number, got ${JSON.stringify(value)}`,
    );
  }
  return value;
}

/**
 * Fill an agent-supplied element out into one Excalidraw will render.
 *
 * `seed` and `versionNonce` are randomised rather than fixed. Excalidraw uses
 * the seed to generate a shape's hand-drawn jitter, so a constant would make
 * every rectangle an agent drew identically wobbly — visibly a template. The
 * nonce is the tiebreak when two clients edit the same element at the same
 * version, and a constant would make that tiebreak decide by nothing.
 */
export function normalizeElement(input: unknown): NormalizedElement {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new DrawingElementError("each element must be an object");
  }
  const el = input as Record<string, unknown>;

  const type = el.type;
  if (typeof type !== "string" || !SHAPE_TYPES.has(type)) {
    throw new DrawingElementError(
      `unknown element type ${JSON.stringify(type)}; supported: ${[...SHAPE_TYPES].join(", ")}`,
    );
  }

  const base: NormalizedElement = {
    id: typeof el.id === "string" && el.id !== "" ? el.id : randomID(),
    type,
    x: num(el.x, 0, "x"),
    y: num(el.y, 0, "y"),
    width: num(el.width, 100, "width"),
    height: num(el.height, 100, "height"),
    angle: num(el.angle, 0, "angle"),
    strokeColor: el.strokeColor ?? DEFAULTS.strokeColor,
    backgroundColor: el.backgroundColor ?? DEFAULTS.backgroundColor,
    fillStyle: el.fillStyle ?? DEFAULTS.fillStyle,
    strokeWidth: num(el.strokeWidth, DEFAULTS.strokeWidth, "strokeWidth"),
    strokeStyle: el.strokeStyle ?? DEFAULTS.strokeStyle,
    roughness: num(el.roughness, DEFAULTS.roughness, "roughness"),
    opacity: num(el.opacity, DEFAULTS.opacity, "opacity"),
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    frameId: el.frameId ?? null,
    roundness: el.roundness ?? null,
    seed: num(el.seed, randomInteger(), "seed"),
    version: num(el.version, 1, "version"),
    versionNonce: num(el.versionNonce, randomInteger(), "versionNonce"),
    isDeleted: el.isDeleted === true,
    boundElements: el.boundElements ?? null,
    updated: num(el.updated, Date.now(), "updated"),
    link: el.link ?? null,
    locked: el.locked === true,
    // Fractional index for z-order. Left null deliberately: Excalidraw repairs
    // invalid indices when a scene is ingested, and a made-up one would order
    // agent-drawn shapes against each other by accident rather than by intent.
    index: el.index ?? null,
  };

  switch (type) {
    case "text":
      return { ...base, ...textFields(el) };
    case "arrow":
    case "line":
      return { ...base, ...linearFields(el) };
    case "freedraw":
      return {
        ...base,
        points: Array.isArray(el.points) ? el.points : [],
        pressures: Array.isArray(el.pressures) ? el.pressures : [],
        simulatePressure: el.simulatePressure !== false,
        lastCommittedPoint: el.lastCommittedPoint ?? null,
      };
    case "image":
      return {
        ...base,
        fileId: el.fileId ?? null,
        scale: Array.isArray(el.scale) ? el.scale : [1, 1],
        status: el.status ?? "saved",
        crop: el.crop ?? null,
      };
    case "frame":
      return { ...base, name: typeof el.name === "string" ? el.name : null };
    default:
      return base;
  }
}

function textFields(el: Record<string, unknown>): Record<string, unknown> {
  const text = typeof el.text === "string" ? el.text : "";
  if (text === "") {
    throw new DrawingElementError("a text element needs a non-empty text");
  }
  return {
    text,
    // originalText is what Excalidraw re-wraps from when a bound label's
    // container is resized. Diverging from `text` makes a label silently
    // revert to different words the first time somebody drags its box.
    originalText: typeof el.originalText === "string" ? el.originalText : text,
    fontSize: num(el.fontSize, DEFAULTS.fontSize, "fontSize"),
    fontFamily: num(el.fontFamily, DEFAULTS.fontFamily, "fontFamily"),
    textAlign: el.textAlign ?? DEFAULTS.textAlign,
    verticalAlign: el.verticalAlign ?? DEFAULTS.verticalAlign,
    containerId: el.containerId ?? null,
    lineHeight: num(el.lineHeight, 1.25, "lineHeight"),
    autoResize: el.autoResize !== false,
  };
}

function linearFields(el: Record<string, unknown>): Record<string, unknown> {
  // Excalidraw draws a linear element from its points, not its width/height —
  // an arrow with no points renders as nothing at all. Default to a straight
  // run across the element's own box so a caller that gave only geometry still
  // gets a visible line.
  const points = Array.isArray(el.points) && el.points.length >= 2
    ? el.points
    : [
        [0, 0],
        [num(el.width, 100, "width"), num(el.height, 0, "height")],
      ];

  return {
    points,
    lastCommittedPoint: el.lastCommittedPoint ?? null,
    startBinding: binding(el.startBinding),
    endBinding: binding(el.endBinding),
    startArrowhead: el.startArrowhead ?? null,
    endArrowhead: el.endArrowhead ?? (el.type === "arrow" ? "arrow" : null),
    elbowed: el.elbowed === true,
  };
}

/**
 * Build the text element that sits inside a shape, for the `label` shorthand.
 *
 * Excalidraw models a labelled box as two elements — the shape, and a text
 * whose containerId points at it — and the pair only holds together if the
 * shape *also* lists the text in its boundElements. Half-wiring it looks
 * correct until somebody drags the box and the words stay behind. That is
 * bookkeeping, not composition, so it is done here rather than asked for.
 */
function labelFor(container: NormalizedElement, text: string): NormalizedElement {
  const fontSize = 16;
  const width = Number(container.width) || 100;
  const height = Number(container.height) || 100;
  const lines = text.split("\n").length;

  return normalizeElement({
    type: "text",
    id: `${container.id}-label`,
    text,
    fontSize,
    containerId: container.id,
    textAlign: "center",
    verticalAlign: "middle",
    strokeColor: container.strokeColor,
    // Excalidraw re-lays a bound label out on load; these are a sane starting
    // box so nothing jumps on first render.
    x: Number(container.x) + 8,
    y: Number(container.y) + height / 2 - (fontSize * 1.25 * lines) / 2,
    width: Math.max(width - 16, 16),
    height: fontSize * 1.25 * lines,
  });
}

/**
 * Normalize a batch, expanding the `label` shorthand and naming which entry
 * failed — an agent told only "invalid element" has to bisect its own payload
 * to find out which.
 *
 * A shape carrying `label` comes back as two elements, already wired to each
 * other in both directions.
 */
export function normalizeElements(input: unknown): NormalizedElement[] {
  if (!Array.isArray(input)) {
    throw new DrawingElementError("elements must be an array");
  }

  const out: NormalizedElement[] = [];
  input.forEach((raw, i) => {
    let el: NormalizedElement;
    try {
      el = normalizeElement(raw);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new DrawingElementError(`element ${i}: ${reason}`);
    }

    const label = (raw as Record<string, unknown>)?.label;
    if (typeof label !== "string" || label.trim() === "") {
      out.push(el);
      return;
    }
    if (el.type === "text") {
      throw new DrawingElementError(
        `element ${i}: a text element carries its words in \`text\`, not \`label\``,
      );
    }

    const text = labelFor(el, label);
    const bound = Array.isArray(el.boundElements) ? el.boundElements : [];
    out.push({ ...el, boundElements: [...bound, { id: text.id, type: "text" }] });
    out.push(text);
  });

  return out;
}
