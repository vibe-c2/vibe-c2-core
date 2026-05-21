import { findChildren } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { createLowlight } from "lowlight"

// Drop-in replacement for the LowlightPlugin shipped by
// @tiptap/extension-code-block-lowlight.
//
// Identity matching strategy
// --------------------------
// Per-block decoration memoization keyed by *two* identities:
//
//   1. PM node reference (primary). For unchanged Y elements,
//      y-prosemirror's meta.mapping cache returns the same PM node across
//      its full-doc-replace rebuild — see `_typeChanged` in
//      @tiptap/y-tiptap. Node identity is the only reliable signal under
//      ySyncPlugin, because y-prosemirror applies remote changes as a
//      single `tr.replace(0, docSize, fullFragment)`, which collapses every
//      internal position in `tr.mapping` to a boundary. Position-keyed
//      lookups all miss for that case.
//
//   2. Forward-mapped position (fallback). For local edits tr.mapping is
//      well-defined, so a block whose content *did* change (e.g. user
//      typed a character inside it) still matches by position even though
//      its PM node ref is new. That lets us keep the stale-mapped
//      decorations as a visual approximation until the async refresh runs.
//
// Refresh
// -------
// The synchronous typing path NEVER calls highlight.js — it only shifts or
// re-maps positions. A debounced view-side timer walks dirty blocks in idle
// time, runs lowlight.highlight on each, and dispatches a META_REFRESH
// transaction with the fresh decorations. Every doc-changing transaction
// cancels and reschedules the timer, so the highlight pass only runs once
// the user pauses.
//
// Net effect: untouched code blocks pay zero work when a collaborator types
// elsewhere; an actively-edited block (local) keeps stale-mapped colors
// until the 50 ms idle window; an actively-edited block (remote) loses its
// colors only between keystrokes until the refresh fires.

type Lowlight = ReturnType<typeof createLowlight>

interface HastNode {
  value?: string
  properties?: { className?: string[] }
  children?: HastNode[]
}

interface HighlightResult {
  value?: HastNode[]
  children?: HastNode[]
}

interface DecorationData {
  readonly from: number
  readonly to: number
  readonly classes: string
}

interface BlockEntry {
  readonly pos: number
  /** Primary identity key: y-binding preserves this ref across remote sync
   *  for unchanged Y elements. */
  readonly node: PMNode
  readonly textContent: string
  readonly language: string | null
  /** Decorations stored at *absolute* document positions in the CURRENT
   *  doc (i.e. the doc this BlockEntry was produced for). */
  readonly decorations: ReadonlyArray<DecorationData>
  /**
   * True when this block needs a fresh highlight pass. Set when the block
   * is brand-new or when its content/language changed since the last
   * refresh; cleared by applyRefresh.
   */
  readonly dirty: boolean
}

interface PluginState {
  readonly decorationSet: DecorationSet
  readonly blocks: ReadonlyArray<BlockEntry>
}

interface Options {
  name: string
  lowlight: Lowlight
  defaultLanguage?: string | null
  /**
   * Idle window after the last doc-changing transaction before dirty blocks
   * are re-tokenized. 50 ms is short enough that token coloring snaps in
   * imperceptibly fast on pause, long enough that bursts of typing don't
   * trigger redundant highlight passes.
   */
  refreshDelayMs?: number
}

interface NormalizedOptions {
  name: string
  lowlight: Lowlight
  defaultLanguage: string | null
  refreshDelayMs: number
}

type RefreshUpdates = ReadonlyMap<number, ReadonlyArray<DecorationData>>

const META_REFRESH = "wikiLowlight$refresh"
const DEFAULT_REFRESH_DELAY_MS = 50

function parseNodes(
  nodes: HastNode[],
  parentClasses: ReadonlyArray<string> = [],
): { text: string; classes: string }[] {
  // Leaf-only flattening: each text leaf inherits only its *immediate parent*
  // element's classes, not the accumulation of every ancestor wrapper.
  //
  // highlight.js emits nested span structures for several grammars — XML
  // wraps `hljs-name`/`hljs-attr`/`hljs-string` in `hljs-tag`; template
  // literals wrap inner spans in `hljs-string`/`hljs-subst`; function
  // signatures wrap `hljs-type`/`hljs-string` in `hljs-params`; and so on.
  // In a real browser those inner spans win the CSS cascade because each
  // child element carries its own explicit color. Accumulating ancestor
  // classes onto every leaf collapses that into a flat multi-class string
  // where the only tiebreaker is CSS declaration order — which silently
  // turned every XML token green, every `def foo(name = "x")` default-value
  // string orange, every JS template subst the string color, etc.
  //
  // Carrying only the leaf's direct parent classes mirrors the nested-DOM
  // cascade: text directly under `<span class="hljs-tag">` (brackets) gets
  // `hljs-tag`; text under an inner `<span class="hljs-name">` (the tag
  // name) gets only `hljs-name`. Compound classes on a single element
  // (e.g. `hljs-title function_`) are still preserved because they come
  // from the same `properties.className` array.
  const out: { text: string; classes: string }[] = []
  for (const node of nodes) {
    if (node.children) {
      const own = node.properties?.className ?? []
      const childParent = own.length ? own : parentClasses
      out.push(...parseNodes(node.children, childParent))
    } else {
      out.push({ text: node.value ?? "", classes: parentClasses.join(" ") })
    }
  }
  return out
}

function getHighlightNodes(result: HighlightResult): HastNode[] {
  return (result.value ?? result.children ?? []) as HastNode[]
}

function isRegistered(lowlight: Lowlight, language: string): boolean {
  if (lowlight.registered?.(language)) return true
  return lowlight.listLanguages().includes(language)
}

function highlightBlock(
  node: PMNode,
  pos: number,
  opts: NormalizedOptions,
): DecorationData[] {
  const { lowlight, defaultLanguage } = opts
  const language: string | null = node.attrs.language || defaultLanguage
  const known = !!language && isRegistered(lowlight, language)
  const result: HighlightResult = known
    ? (lowlight.highlight(language, node.textContent) as HighlightResult)
    : (lowlight.highlightAuto(node.textContent) as HighlightResult)
  const decorations: DecorationData[] = []
  let from = pos + 1
  for (const tok of parseNodes(getHighlightNodes(result))) {
    const to = from + tok.text.length
    if (tok.classes) {
      decorations.push({ from, to, classes: tok.classes })
    }
    from = to
  }
  return decorations
}

function shiftDecorations(
  decorations: ReadonlyArray<DecorationData>,
  shift: number,
): DecorationData[] {
  if (shift === 0) return decorations as DecorationData[]
  const out: DecorationData[] = []
  for (const d of decorations) {
    out.push({ from: d.from + shift, to: d.to + shift, classes: d.classes })
  }
  return out
}

function mapDecorations(
  decorations: ReadonlyArray<DecorationData>,
  mapping: Transaction["mapping"],
): DecorationData[] {
  const out: DecorationData[] = []
  for (const d of decorations) {
    const from = mapping.map(d.from, 1)
    const to = mapping.map(d.to, -1)
    if (from < to) out.push({ from, to, classes: d.classes })
  }
  return out
}

function buildDecorationSet(
  doc: PMNode,
  blocks: ReadonlyArray<BlockEntry>,
): DecorationSet {
  const all: Decoration[] = []
  for (const block of blocks) {
    for (const d of block.decorations) {
      all.push(Decoration.inline(d.from, d.to, { class: d.classes }))
    }
  }
  return DecorationSet.create(doc, all)
}

function freshEntry(
  node: PMNode,
  pos: number,
  opts: NormalizedOptions,
): BlockEntry {
  return {
    pos,
    node,
    textContent: node.textContent,
    language: node.attrs.language || opts.defaultLanguage,
    decorations: highlightBlock(node, pos, opts),
    dirty: false,
  }
}

function initState(doc: PMNode, opts: NormalizedOptions): PluginState {
  const blocks: BlockEntry[] = []
  findChildren(doc, (n) => n.type.name === opts.name).forEach(({ node, pos }) => {
    blocks.push(freshEntry(node, pos, opts))
  })
  return { blocks, decorationSet: buildDecorationSet(doc, blocks) }
}

function applyDocChange(
  tr: Transaction,
  prev: PluginState,
  opts: NormalizedOptions,
): PluginState {
  // Build both lookup tables up front. Node-ref matching is the primary
  // path (survives ySyncPlugin's full-doc-replace, which destroys positions
  // in tr.mapping). Position matching is the local-edit fallback (tr.mapping
  // is well-defined there) so a block the user is actively typing into
  // keeps its previous decorations as a stale visual approximation rather
  // than going blank for the 50 ms until the async refresh fires.
  const oldByNode = new Map<PMNode, BlockEntry>()
  const oldByMappedPos = new Map<number, BlockEntry>()
  for (const entry of prev.blocks) {
    oldByNode.set(entry.node, entry)
    oldByMappedPos.set(tr.mapping.map(entry.pos, 1), entry)
  }

  const newBlocks: BlockEntry[] = []
  findChildren(tr.doc, (n) => n.type.name === opts.name).forEach(({ node, pos }) => {
    const newTextContent = node.textContent
    const newLanguage: string | null = node.attrs.language || opts.defaultLanguage

    // Path 1: node-ref hit. Common case under collaborative editing — the
    // local block didn't change, but everything moved because y-prosemirror
    // rebuilt the doc. Reuse decorations, shifting only if the block landed
    // at a new absolute position.
    const byNode = oldByNode.get(node)
    if (
      byNode &&
      byNode.textContent === newTextContent &&
      byNode.language === newLanguage
    ) {
      newBlocks.push({
        pos,
        node,
        textContent: newTextContent,
        language: newLanguage,
        decorations: shiftDecorations(byNode.decorations, pos - byNode.pos),
        dirty: byNode.dirty,
      })
      return
    }

    // Path 2: position hit. Either (a) same block, content unchanged, but
    // node ref differs (rare under typical PM updates), or (b) the block
    // was edited in place — we want to keep stale-mapped decorations as a
    // visual placeholder.
    const byPos = oldByMappedPos.get(pos)
    if (byPos) {
      const contentSame = byPos.textContent === newTextContent
      const languageSame = byPos.language === newLanguage
      if (contentSame && languageSame) {
        newBlocks.push({
          pos,
          node,
          textContent: newTextContent,
          language: newLanguage,
          decorations: shiftDecorations(byPos.decorations, pos - byPos.pos),
          dirty: byPos.dirty,
        })
        return
      }
      newBlocks.push({
        pos,
        node,
        textContent: newTextContent,
        language: newLanguage,
        decorations: mapDecorations(byPos.decorations, tr.mapping),
        dirty: true,
      })
      return
    }

    // Path 3: brand-new block, or an existing block whose ref changed AND
    // whose mapped position collapsed (typical of an actively-edited block
    // under a y-sync transaction). No prior decorations to reuse — render
    // plain until the async refresh fires.
    newBlocks.push({
      pos,
      node,
      textContent: newTextContent,
      language: newLanguage,
      decorations: [],
      dirty: true,
    })
  })

  return {
    blocks: newBlocks,
    decorationSet: buildDecorationSet(tr.doc, newBlocks),
  }
}

function applyRefresh(
  doc: PMNode,
  prev: PluginState,
  updates: RefreshUpdates,
): PluginState {
  const newBlocks: BlockEntry[] = prev.blocks.map((block) => {
    const fresh = updates.get(block.pos)
    if (!fresh) return block
    return {
      pos: block.pos,
      node: block.node,
      textContent: block.textContent,
      language: block.language,
      decorations: fresh,
      dirty: false,
    }
  })
  return {
    blocks: newBlocks,
    decorationSet: buildDecorationSet(doc, newBlocks),
  }
}

export function createIncrementalLowlightPlugin(
  options: Options,
): Plugin<PluginState> {
  const opts: NormalizedOptions = {
    name: options.name,
    lowlight: options.lowlight,
    defaultLanguage: options.defaultLanguage ?? null,
    refreshDelayMs: options.refreshDelayMs ?? DEFAULT_REFRESH_DELAY_MS,
  }
  const key = new PluginKey<PluginState>("wikiLowlight")

  return new Plugin<PluginState>({
    key,
    state: {
      init: (_config, state: EditorState) => initState(state.doc, opts),
      apply: (tr, prev) => {
        const refreshUpdates = tr.getMeta(META_REFRESH) as RefreshUpdates | undefined
        if (refreshUpdates) {
          return applyRefresh(tr.doc, prev, refreshUpdates)
        }
        if (!tr.docChanged) return prev
        return applyDocChange(tr, prev, opts)
      },
    },
    view: (view) => {
      let timer: ReturnType<typeof setTimeout> | null = null

      function clear() {
        if (timer != null) {
          clearTimeout(timer)
          timer = null
        }
      }

      function schedule() {
        clear()
        timer = setTimeout(runRefresh, opts.refreshDelayMs)
      }

      function runRefresh() {
        timer = null
        const state = key.getState(view.state)
        if (!state) return
        const updates = new Map<number, ReadonlyArray<DecorationData>>()
        for (const block of state.blocks) {
          if (!block.dirty) continue
          const node = view.state.doc.nodeAt(block.pos)
          // The block could have been removed since the dirty mark was set
          // (collaborative edit, slash command, etc.). Skip silently.
          if (!node || node.type.name !== opts.name) continue
          if (node.textContent !== block.textContent) continue
          updates.set(block.pos, highlightBlock(node, block.pos, opts))
        }
        if (updates.size === 0) return
        view.dispatch(view.state.tr.setMeta(META_REFRESH, updates))
      }

      return {
        update: (_, prevState) => {
          // Only reschedule when the doc actually changed. Selection-only
          // transactions don't introduce new dirty blocks, and rescheduling
          // on every cursor move would push the refresh out indefinitely
          // for a user who's idle but moving the mouse.
          if (prevState.doc.eq(view.state.doc)) return
          const cur = key.getState(view.state)
          if (cur?.blocks.some((b) => b.dirty)) schedule()
        },
        destroy: clear,
      }
    },
    props: {
      decorations(state) {
        return key.getState(state)?.decorationSet
      },
    },
  })
}
