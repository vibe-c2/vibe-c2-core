import { findChildren } from "@tiptap/core"
import type { Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { createLowlight } from "lowlight"

// Drop-in replacement for the LowlightPlugin shipped by
// @tiptap/extension-code-block-lowlight. Two layers of optimization:
//
//   1. Per-block memoization. The plugin tracks each code block's textContent
//      and language alongside its decorations. On every doc-changing
//      transaction we forward-map old block positions, then for each new
//      block: hit (textContent + language unchanged) → reuse mapped
//      decorations, no highlight.js call. Miss → mark the block "dirty" and
//      keep its previous decorations, mapped through tr.mapping, as a stale
//      visual approximation.
//
//   2. Async refresh of dirty blocks. The synchronous typing path NEVER
//      calls highlight.js — it only does mapping. A debounced view-side timer
//      walks dirty blocks in idle time, runs lowlight.highlight on each, and
//      dispatches a META_REFRESH transaction with the fresh decorations.
//      Every doc-changing transaction cancels and reschedules the timer, so
//      the highlight pass only runs once the user pauses.
//
// Net effect: per-keystroke cost is independent of any code block's size.
// Token coloring lags the cursor by one debounce window (~50 ms) inside the
// edited block; everywhere else it stays exact.

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
  readonly textContent: string
  readonly language: string | null
  readonly decorations: ReadonlyArray<DecorationData>
  /**
   * True when `decorations` is a stale (mapped) approximation that does not
   * yet reflect the current `textContent` / `language`. Cleared when the
   * async refresh task replaces the decorations.
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
  inheritedClasses: ReadonlyArray<string> = [],
): { text: string; classes: string }[] {
  const out: { text: string; classes: string }[] = []
  for (const node of nodes) {
    const own = node.properties?.className ?? []
    const classes = own.length ? [...inheritedClasses, ...own] : inheritedClasses
    if (node.children) {
      out.push(...parseNodes(node.children, classes))
    } else {
      out.push({ text: node.value ?? "", classes: classes.join(" ") })
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

function mapDecorations(
  decorations: ReadonlyArray<DecorationData>,
  mapping: Transaction["mapping"],
): DecorationData[] {
  return decorations.map((d) => ({
    from: mapping.map(d.from, 1),
    to: mapping.map(d.to, -1),
    classes: d.classes,
  }))
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
      textContent: block.textContent,
      language: block.language,
      decorations: fresh,
      dirty: false,
    }
  })
  return { blocks: newBlocks, decorationSet: buildDecorationSet(doc, newBlocks) }
}

function applyDocChange(
  tr: Transaction,
  prev: PluginState,
  opts: NormalizedOptions,
): PluginState {
  // Forward-map old block positions. The mapped position is where the block
  // *would* be in the new doc if its boundaries survived. Whether it's still
  // a code block is decided by the textContent / language check below.
  const oldByMappedPos = new Map<number, BlockEntry>()
  for (const entry of prev.blocks) {
    oldByMappedPos.set(tr.mapping.map(entry.pos, 1), entry)
  }

  const newBlocks: BlockEntry[] = []
  findChildren(tr.doc, (n) => n.type.name === opts.name).forEach(({ node, pos }) => {
    const oldEntry = oldByMappedPos.get(pos)
    const newTextContent = node.textContent
    const newLanguage: string | null = node.attrs.language || opts.defaultLanguage

    if (oldEntry == null) {
      // Brand-new block (initial sync, paste, slash command, split). Show
      // plain text until the async refresh fires; users typically aren't
      // typing into a block they just created in the same frame.
      newBlocks.push({
        pos,
        textContent: newTextContent,
        language: newLanguage,
        decorations: [],
        dirty: true,
      })
      return
    }

    const contentSame = oldEntry.textContent === newTextContent
    const languageSame = oldEntry.language === newLanguage

    if (contentSame && languageSame) {
      // True cache hit. Reuse decorations, mapped through the transaction.
      // Preserve dirty so a block awaiting refresh stays queued.
      newBlocks.push({
        pos,
        textContent: newTextContent,
        language: newLanguage,
        decorations: mapDecorations(oldEntry.decorations, tr.mapping),
        dirty: oldEntry.dirty,
      })
      return
    }

    // Content or language changed. Don't run highlight.js synchronously —
    // mapping the old decorations is a usable visual stand-in (typed chars
    // inherit their neighbors' classes), and the async refresh will replace
    // them within the debounce window.
    newBlocks.push({
      pos,
      textContent: newTextContent,
      language: newLanguage,
      decorations: mapDecorations(oldEntry.decorations, tr.mapping),
      dirty: true,
    })
  })

  return {
    blocks: newBlocks,
    decorationSet: buildDecorationSet(tr.doc, newBlocks),
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
