import { useEffect, useRef } from "react"
import { useParams } from "react-router"
import { BookOpenIcon } from "lucide-react"
import { useEffectiveWikiOperation } from "@/hooks/use-effective-wiki-operation-id"
import { useWikiTreeModeStore } from "@/stores/wiki-tree-mode"
import { isPublicOperation } from "@/lib/public-operation"
import { useMyOperationRole } from "@/graphql/hooks/operations"
import {
  useWikiDocument,
  useWikiDocumentChangedSubscription,
  useWikiDocumentChildren,
  useWikiDocumentPresenceChangedSubscription,
  useWikiDocumentTreeRevealPath,
  useTrackWikiDocumentVisit,
} from "@/graphql/hooks/wiki"
import { useCredentialChangedSubscription } from "@/graphql/hooks/credentials"
import {
  ADAPTIVE_ICON_NAME,
  resolveAdaptiveIcon,
} from "@/components/wiki/icon-catalog"
import { usePageMetadata, type PageIcon } from "@/hooks/use-page-metadata"
import { useWikiStore } from "@/stores/wiki"
import { WikiTreeSidebar } from "@/components/wiki/wiki-tree-sidebar"
import { ResizeHandle } from "@/components/wiki/resize-handle"
import { WikiContentArea } from "@/components/wiki/wiki-content-area"
import { openWikiSearch } from "@/components/wiki/wiki-command-palette"
import { WikiRecentDocsModal } from "@/components/wiki/wiki-recent-docs-modal"
import { CreateWikiDocumentDialog } from "@/components/wiki/create-wiki-document-dialog"
import { DeleteWikiDocumentDialog } from "@/components/wiki/delete-wiki-document-dialog"
import { DuplicateWikiDocumentDialog } from "@/components/wiki/duplicate-wiki-document-dialog"
import { ExportWikiDialog } from "@/components/wiki/export-wiki-dialog"
import { ImportOutlineDialog } from "@/components/wiki/import-outline-dialog"
import { MoveWikiDocumentDialog } from "@/components/wiki/move-wiki-document-dialog"
import { PermanentDeleteWikiDocumentDialog } from "@/components/wiki/permanent-delete-wiki-document-dialog"
import { WikiTrashPanel } from "@/components/wiki/wiki-trash-panel"
import { WikiBackupPanel } from "@/components/wiki/wiki-backup-panel"
import { WikiCredentialPickerDialog } from "@/components/wiki/wiki-credential-picker"
import { CredentialDetailsDialog } from "@/components/findings/credential-details-dialog"
import { EditCredentialDialog } from "@/components/findings/edit-credential-dialog"
import { DeleteCredentialDialog } from "@/components/findings/delete-credential-dialog"
import { WikiHashPickerDialog } from "@/components/wiki/wiki-hash-picker"
import { HashDetailsDialog } from "@/components/findings/hash-details-dialog"
import { DeleteHashDialog } from "@/components/findings/delete-hash-dialog"
import { MarkHashCrackedDialog } from "@/components/findings/mark-hash-cracked-dialog"

export function WikiPage() {
  const { effectiveOperationId, isPublicMode, hasRealScope } =
    useEffectiveWikiOperation()
  const { documentId } = useParams<{ documentId: string }>()

  // The wiki page is reachable with or without a scoped operation. With no
  // scope (or with the user's mode toggle set to "public"), the tree targets
  // the synthetic Public operation. Backend authorization grants implicit
  // operator access on PublicOperationID to every authenticated caller.
  return (
    <WikiPageInner
      operationId={effectiveOperationId}
      documentId={documentId ?? null}
      isPublicMode={isPublicMode}
      hasRealScope={hasRealScope}
    />
  )
}

function WikiPageInner({
  operationId,
  documentId,
  isPublicMode,
  hasRealScope,
}: {
  operationId: string
  documentId: string | null
  isPublicMode: boolean
  hasRealScope: boolean
}) {
  // Note: Dropping the open document on scope change is handled at the
  // route-guard level (ProtectedRoute) so it works across both same-tab and
  // cross-tab switches — the latter unmounts this page during validation.
  // Public mode is scope-independent so the route guard skips it.

  const { data: roleData, isLoading: isRoleLoading } = useMyOperationRole(operationId)
  // Default to false while loading to avoid premature WebSocket connections.
  const isEditor = !isRoleLoading && roleData?.myOperationRole !== "VIEWER"

  // Browser tab title + favicon. Reads the open document from the same
  // TanStack Query cache key as wiki-editor-pane.tsx — no extra request.
  // While the doc is null/loading we fall back to "Wiki" + book icon, so
  // there's at most one transition per navigation.
  const { data: docData } = useWikiDocument(documentId ?? "")
  const doc = documentId ? docData?.wikiDocument : null

  // URL → tree-mode sync. If the URL points at a doc whose operation differs
  // from the current effective operation, flip the mode so the sidebar tree
  // matches the open doc. Without this, sharing a Public-doc link while a
  // recipient has a scope set leaves the tree showing the operation while the
  // editor renders a doc from a different tree. Only meaningful when a real
  // scope exists — without one, mode is forced to "public" already.
  //
  // Three intents to disambiguate from the same effect re-run:
  //
  //  1. URL navigation to a new doc → AUTO-SYNC mode to match the doc.
  //  2. User toggled the mode → PRESERVE the user's choice, never flip back.
  //  3. Doc query resolved (docOperationId went null → real) → complete a
  //     pending sync from #1 only if the user hasn't toggled in the meantime.
  //
  // Implementation:
  //   - `pendingSyncDoc`: id of the doc we owe an auto-sync for. Set on
  //     navigation, cleared by either a successful sync or a user toggle.
  //   - `lastDoc` / `lastOp`: previous values, used to classify the rerun.
  //
  // The old single-ref dedupe had a race: if the user toggled *before* the
  // doc query resolved, `docOperationId` was null on the toggle-driven run
  // and the ref was never advanced. When the doc later resolved, the sync
  // logic fired and silently reverted the toggle. The pendingSyncDoc handle
  // closes that window — a toggle clears the pending intent, so the
  // resolved-doc run becomes a no-op.
  const setWikiTreeMode = useWikiTreeModeStore((s) => s.setMode)
  const docOperationId = doc?.operationId ?? null
  const pendingSyncDoc = useRef<string | null>(null)
  const lastDoc = useRef<string | null>(null)
  const lastOp = useRef<string | null>(null)
  useEffect(() => {
    if (!hasRealScope || !documentId) {
      pendingSyncDoc.current = null
      lastDoc.current = documentId
      lastOp.current = operationId
      return
    }

    const docNavigated = lastDoc.current !== documentId
    // A pure op change while the same doc stays open is a user toggle.
    // (Tree mode is per-tab sessionStorage state, so the toggle is the only
    // way the effective op changes without a navigation.)
    const userToggled =
      !docNavigated && lastOp.current !== null && lastOp.current !== operationId

    lastDoc.current = documentId
    lastOp.current = operationId

    if (userToggled) {
      // Drop any queued auto-sync so a late-arriving doc resolution doesn't
      // override the user's just-made choice.
      pendingSyncDoc.current = null
      return
    }

    if (docNavigated) {
      // Queue the sync; the actual mode flip happens below once
      // docOperationId is known.
      pendingSyncDoc.current = documentId
    }

    if (pendingSyncDoc.current !== documentId) return
    if (!docOperationId) return // wait for the doc query to resolve
    pendingSyncDoc.current = null
    if (docOperationId === operationId) return
    setWikiTreeMode(isPublicOperation(docOperationId) ? "public" : "operation")
  }, [documentId, docOperationId, operationId, hasRealScope, setWikiTreeMode])
  // The adaptive default needs to know whether this doc has children to pick
  // between file/folder glyphs (mirrors wiki-editor-header.tsx:132). Gate the
  // children fetch behind that — uncurated/explicit icons don't need it. The
  // same cache key feeds the sidebar lazy-expand and editor-header dropdown,
  // so this is a cache hit in the common case.
  const isAdaptive = !!doc && doc.icon === ADAPTIVE_ICON_NAME
  const { data: childrenData } = useWikiDocumentChildren(
    operationId,
    doc?.id ?? null,
    { enabled: isAdaptive },
  )
  const adaptiveHasChildren =
    (childrenData?.wikiDocumentChildren?.length ?? 0) > 0
  const wikiDefaultIcon: PageIcon = { kind: "lucide", component: BookOpenIcon }
  const pageIcon: PageIcon = (() => {
    if (!doc) return wikiDefaultIcon
    if (doc.icon === ADAPTIVE_ICON_NAME) {
      // isExpanded=true: the user is viewing this doc, so the branch glyph
      // should match the editor header (open folder, not collapsed).
      return {
        kind: "lucide",
        component: resolveAdaptiveIcon(adaptiveHasChildren, true),
        color: doc.color,
      }
    }
    if (doc.icon)
      return {
        kind: "lucide-name",
        name: doc.icon,
        color: doc.color,
        fallbackEmoji: doc.emoji,
      }
    if (doc.emoji) return { kind: "emoji", emoji: doc.emoji }
    return wikiDefaultIcon
  })()
  usePageMetadata({
    title: doc ? doc.title || "Untitled" : "Wiki",
    icon: pageIcon,
  })

  // Real-time subscriptions scoped to this operation. All three share the
  // single graphql-ws WebSocket transport (lib/graphql-ws-client.ts) so the
  // page-level socket budget is one WS for graphql + one WS for hocuspocus,
  // independent of how many subscriptions we mount.
  //
  // credentialChanged keeps the wiki-credential-chip live: when a colleague
  // edits a credential referenced inline in a document, the subscription
  // writes the fresh entity into the same React Query cache key the chip
  // reads from, so the chip updates without manual refresh.
  useWikiDocumentChangedSubscription(operationId)
  useWikiDocumentPresenceChangedSubscription(operationId)
  useCredentialChangedSubscription(operationId)

  // Reveal-path: when the URL points at a document, fetch every row the
  // sidebar needs to render itself expanded down to that doc — and shred
  // the response into per-parent `children` cache entries so the lazy
  // renders that follow are cache hits. Only fires when documentId is set.
  const { data: revealData } = useWikiDocumentTreeRevealPath(
    documentId ?? "",
    operationId,
  )

  const sidebarWidth = useWikiStore((s) => s.sidebarWidth)
  const setSidebarWidth = useWikiStore((s) => s.setSidebarWidth)
  const expandMany = useWikiStore((s) => s.expandMany)

  // Auto-expand the tree to reveal the open document. The reveal-path hook
  // already returns the precomputed ancestor chain — expand it once per
  // navigation. The user can manually collapse afterwards without us
  // fighting back.
  const lastExpandedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!documentId) {
      lastExpandedFor.current = null
      return
    }
    const ancestorIds = revealData?.ancestorIds
    if (!ancestorIds || ancestorIds.length === 0) return
    if (lastExpandedFor.current === documentId) return
    lastExpandedFor.current = documentId
    expandMany(ancestorIds)
  }, [documentId, revealData?.ancestorIds, expandMany])

  // Record a visit ~700ms after a document opens, so quick navigation
  // through the tree doesn't spam the mutation. Best-effort: failures are
  // silent (history is a convenience). The ref dedupes per documentId so
  // re-renders don't re-fire.
  const trackedFor = useRef<string | null>(null)
  const trackVisit = useTrackWikiDocumentVisit()
  useEffect(() => {
    if (!documentId) {
      trackedFor.current = null
      return
    }
    if (trackedFor.current === documentId) return
    const t = setTimeout(() => {
      trackedFor.current = documentId
      trackVisit.mutate({ documentId })
    }, 700)
    return () => clearTimeout(t)
  }, [documentId, trackVisit])

  // Global Cmd/Ctrl+K opens the command palette with the "All Documents"
  // scope. Bound at the page level so any focus state inside the wiki
  // surface gets the shortcut. Explicitly skips fires while a text field
  // already has focus *in another modal* by matching on event target — but
  // honored even inside the editor, because search is the whole point.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        openWikiSearch({
          operationId,
          parentDocumentId: null,
          parentTitle: "All Documents",
        })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [operationId])

  // Shared ref so ResizeHandle can mutate the sidebar's `--wiki-sidebar-width`
  // CSS variable directly during a drag (no React render until mouseup).
  const sidebarRef = useRef<HTMLDivElement | null>(null)

  return (
    <div className="flex h-svh min-h-0 gap-1 overflow-hidden p-2">
      <WikiTreeSidebar
        ref={sidebarRef}
        operationId={operationId}
        isEditor={isEditor}
        isPublicMode={isPublicMode}
        hasRealScope={hasRealScope}
      />
      <ResizeHandle
        currentWidth={sidebarWidth}
        onResize={setSidebarWidth}
        sidebarRef={sidebarRef}
      />
      <WikiContentArea
        documentId={documentId}
        operationId={operationId}
        isEditor={isEditor}
      />

      {/* Dialogs + panels — mounted once, controlled by store. Move dialog
          owns its own tree fetch (lazy on dialog-open) so the wiki page no
          longer eagerly loads the full tree on every navigation. */}
      <CreateWikiDocumentDialog operationId={operationId} />
      <ImportOutlineDialog operationId={operationId} />
      <ExportWikiDialog operationId={operationId} />
      <MoveWikiDocumentDialog operationId={operationId} />
      <DeleteWikiDocumentDialog documentId={documentId} />
      <DuplicateWikiDocumentDialog />
      <PermanentDeleteWikiDocumentDialog />
      <WikiTrashPanel operationId={operationId} />
      <WikiBackupPanel />
      <WikiRecentDocsModal operationId={operationId} />

      {/* Credential surface mounted at the page level so chip-driven flows
          (details / edit / delete / picker) survive navigation between
          documents within the wiki. State is store-driven so these stay
          dormant until a chip or slash command opens them. */}
      <CredentialDetailsDialog />
      <EditCredentialDialog />
      <DeleteCredentialDialog />
      <WikiCredentialPickerDialog />
      {/* Hash reference chips mirror credential chips: the picker inserts the
          /hash node, and the details / delete / mark-cracked dialogs back the
          chip click + right-click menu. Store-driven, so dormant until used. */}
      <HashDetailsDialog />
      <DeleteHashDialog />
      <MarkHashCrackedDialog />
      <WikiHashPickerDialog />
    </div>
  )
}
