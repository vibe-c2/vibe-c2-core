import { useEffect, useRef } from "react"
import { Navigate, useParams } from "react-router"
import { BookOpenIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
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
import { WikiCommandPalette } from "@/components/wiki/wiki-command-palette"
import { WikiRecentDocsModal } from "@/components/wiki/wiki-recent-docs-modal"
import { CreateWikiDocumentDialog } from "@/components/wiki/create-wiki-document-dialog"
import { DeleteWikiDocumentDialog } from "@/components/wiki/delete-wiki-document-dialog"
import { ImportOutlineDialog } from "@/components/wiki/import-outline-dialog"
import { MoveWikiDocumentDialog } from "@/components/wiki/move-wiki-document-dialog"
import { PermanentDeleteWikiDocumentDialog } from "@/components/wiki/permanent-delete-wiki-document-dialog"
import { WikiTrashPanel } from "@/components/wiki/wiki-trash-panel"
import { WikiBackupPanel } from "@/components/wiki/wiki-backup-panel"
import { WikiCredentialPickerDialog } from "@/components/wiki/wiki-credential-picker"
import { WikiDocumentPickerDialog } from "@/components/wiki/wiki-document-picker"
import { CredentialDetailsDialog } from "@/components/findings/credential-details-dialog"
import { EditCredentialDialog } from "@/components/findings/edit-credential-dialog"
import { DeleteCredentialDialog } from "@/components/findings/delete-credential-dialog"

export function WikiPage() {
  const scopedOperation = useScopedOperation()
  const { documentId } = useParams<{ documentId: string }>()

  // Redirect if no operation is scoped.
  if (!scopedOperation) {
    return <Navigate to="/operations" replace />
  }

  return (
    <WikiPageInner
      operationId={scopedOperation.id}
      documentId={documentId ?? null}
    />
  )
}

function WikiPageInner({
  operationId,
  documentId,
}: {
  operationId: string
  documentId: string | null
}) {
  // Note: Dropping the open document on scope change is handled at the
  // route-guard level (ProtectedRoute) so it works across both same-tab and
  // cross-tab switches — the latter unmounts this page during validation.

  const { data: roleData, isLoading: isRoleLoading } = useMyOperationRole(operationId)
  // Default to false while loading to avoid premature WebSocket connections.
  const isEditor = !isRoleLoading && roleData?.myOperationRole !== "VIEWER"

  // Browser tab title + favicon. Reads the open document from the same
  // TanStack Query cache key as wiki-editor-pane.tsx — no extra request.
  // While the doc is null/loading we fall back to "Wiki" + book icon, so
  // there's at most one transition per navigation.
  const { data: docData } = useWikiDocument(documentId ?? "")
  const doc = documentId ? docData?.wikiDocument : null
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
  const openContentSearch = useWikiStore((s) => s.openContentSearch)
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
        openContentSearch(null, "All Documents")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [openContentSearch])

  // Shared ref so ResizeHandle can mutate the sidebar's `--wiki-sidebar-width`
  // CSS variable directly during a drag (no React render until mouseup).
  const sidebarRef = useRef<HTMLDivElement | null>(null)

  return (
    <div className="flex h-svh min-h-0 gap-1 overflow-hidden p-2">
      <WikiTreeSidebar
        ref={sidebarRef}
        operationId={operationId}
        isEditor={isEditor}
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
      <MoveWikiDocumentDialog operationId={operationId} />
      <DeleteWikiDocumentDialog documentId={documentId} />
      <PermanentDeleteWikiDocumentDialog />
      <WikiTrashPanel operationId={operationId} />
      <WikiBackupPanel />
      <WikiCommandPalette operationId={operationId} />
      <WikiRecentDocsModal operationId={operationId} />

      {/* Credential surface mounted at the page level so chip-driven flows
          (details / edit / delete / picker) survive navigation between
          documents within the wiki. State is store-driven so these stay
          dormant until a chip or slash command opens them. */}
      <CredentialDetailsDialog />
      <EditCredentialDialog />
      <DeleteCredentialDialog />
      <WikiCredentialPickerDialog />
      <WikiDocumentPickerDialog />
    </div>
  )
}
