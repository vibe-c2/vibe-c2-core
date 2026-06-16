import { type FormEvent, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SearchInput } from "@/components/ui/search-input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useWikiStore } from "@/stores/wiki"
import {
  useCreateWikiDocument,
  useInstantiateTemplate,
  useWikiDocumentTree,
} from "@/graphql/hooks/wiki"
import {
  DocumentIconPicker,
  type DocumentIconValue,
} from "@/components/wiki/document-icon-picker"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { ADAPTIVE_ICON_NAME } from "@/components/wiki/icon-catalog"
import {
  PUBLIC_OPERATION_ID,
  PUBLIC_OPERATION_NAME,
  isPublicOperation,
} from "@/lib/public-operation"

interface CreateWikiDocumentDialogProps {
  operationId: string
}

type CreateMode = "regular" | "template"

// Adaptive default: renders as a page icon on a leaf doc, swaps to a
// folder once children land. Picked here over the legacy "📂" emoji so a
// brand-new doc reads as a page until it actually nests.
const DEFAULT_ICON_VALUE: DocumentIconValue = {
  emoji: "",
  icon: ADAPTIVE_ICON_NAME,
  color: "",
}

export function CreateWikiDocumentDialog({ operationId }: CreateWikiDocumentDialogProps) {
  const { createDialogOpen, createParentId, closeCreateDialog } = useWikiStore()
  const expandNode = useWikiStore((s) => s.expandNode)
  const setPendingFocusDocId = useWikiStore((s) => s.setPendingFocusDocId)
  const createDocument = useCreateWikiDocument()
  const instantiate = useInstantiateTemplate()
  const navigate = useNavigate()

  // Public-tree templates are visible from every operation; an operation's own
  // templates are visible only inside it. When the create target IS the Public
  // tree, the operation fetch and the public fetch would be the same query, so
  // we skip the duplicate.
  const inPublicTree = isPublicOperation(operationId)

  const [mode, setMode] = useState<CreateMode>("regular")
  const [error, setError] = useState<string | null>(null)
  // Shared by both tabs: the icon the new document gets. In Blank mode it starts
  // at the adaptive default; in From-template mode it's seeded from the picked
  // template (until the operator overrides it), so a fork can carry its own icon.
  const [iconValue, setIconValue] = useState<DocumentIconValue>(DEFAULT_ICON_VALUE)
  const [iconDirty, setIconDirty] = useState(false)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [templateQuery, setTemplateQuery] = useState("")
  // The operator names the instance. Prefilled from the picked template's title
  // (so it's never blank by default) until the operator edits it themselves.
  const [instanceTitle, setInstanceTitle] = useState("")
  const [titleDirty, setTitleDirty] = useState(false)

  // Templates live in-place across two reachable trees: the scoped operation
  // and the global Public tree. Fetch both while the From-template tab is open
  // and merge. Skip the Public fetch when the target already IS Public (the two
  // queries would be identical). Each fetch is a cache hit if the tree was
  // already browsed in the sidebar.
  const enabled = createDialogOpen && mode === "template"
  const { data: opData, isLoading: opLoading } = useWikiDocumentTree(
    operationId,
    { enabled },
  )
  const { data: pubData, isLoading: pubLoading } = useWikiDocumentTree(
    PUBLIC_OPERATION_ID,
    { enabled: enabled && !inPublicTree },
  )
  const tplLoading = opLoading || (!inPublicTree && pubLoading)

  const templates = useMemo(() => {
    const rows = [
      ...(opData?.wikiDocumentTree ?? []),
      ...(inPublicTree ? [] : (pubData?.wikiDocumentTree ?? [])),
    ]
    const q = templateQuery.trim().toLowerCase()
    // A template is any document flagged isTemplate; we additionally require a
    // real body, since forking an empty doc yields an empty doc. The operation
    // and Public trees have disjoint ids, so no dedupe is needed. Alphabetical.
    return rows
      .filter((r) => r.isTemplate && r.hasContent)
      .filter((r) => (q ? r.title.toLowerCase().includes(q) : true))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [opData?.wikiDocumentTree, pubData?.wikiDocumentTree, inPublicTree, templateQuery])

  function reset() {
    setError(null)
    setIconValue(DEFAULT_ICON_VALUE)
    setIconDirty(false)
    setMode("regular")
    setTemplateId(null)
    setTemplateQuery("")
    setInstanceTitle("")
    setTitleDirty(false)
  }

  // An explicit pick from either tab's icon picker marks the icon dirty, so a
  // later template selection won't silently overwrite the operator's choice.
  function handleIconSelect(value: DocumentIconValue) {
    setIconValue(value)
    setIconDirty(true)
  }

  function selectTemplate(tpl: DocumentIconValue & { id: string; title: string }) {
    setTemplateId(tpl.id)
    // Seed the name + icon from the template until the operator overrides them,
    // so the fork defaults to looking like its template but stays editable.
    if (!titleDirty) setInstanceTitle(tpl.title)
    if (!iconDirty) {
      setIconValue({ emoji: tpl.emoji, icon: tpl.icon, color: tpl.color })
    }
  }

  function handleClose() {
    closeCreateDialog()
    reset()
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (mode === "template") {
      if (!templateId) {
        setError("Pick a template")
        return
      }
      try {
        const result = await instantiate.mutateAsync({
          templateId,
          targetOperationId: operationId,
          parentDocumentId: createParentId ?? null,
          title: instanceTitle.trim() || null,
          // Send the picker state so the operator's icon (seeded from the
          // template, possibly overridden) lands on the new instance.
          emoji: iconValue.emoji,
          icon: iconValue.icon,
          color: iconValue.color,
        })
        if (createParentId) expandNode(createParentId)
        const newId = result.instantiateTemplate.id
        handleClose()
        setPendingFocusDocId(newId)
        navigate(`/wiki/${newId}`)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create from template",
        )
      }
      return
    }

    const form = new FormData(e.currentTarget)
    const title = (form.get("title") as string).trim()
    if (!title) return

    try {
      const result = await createDocument.mutateAsync({
        operationId,
        input: {
          title,
          emoji: iconValue.emoji || undefined,
          icon: iconValue.icon || undefined,
          color: iconValue.color || undefined,
          parentDocumentId: createParentId ?? undefined,
        },
      })
      if (createParentId) expandNode(createParentId)
      const newId = result.createWikiDocument.id
      handleClose()
      // One-shot signal — the editor reads + clears this when it mounts for the
      // new doc, so the caret lands inside the empty body without a click.
      setPendingFocusDocId(newId)
      navigate(`/wiki/${newId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create document")
    }
  }

  const isPending = createDocument.isPending || instantiate.isPending
  const submitDisabled =
    isPending ||
    (mode === "template" &&
      (templateId === null || instanceTitle.trim() === ""))

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Document</DialogTitle>
          <DialogDescription>
            {mode === "template"
              ? "Fork a template into this operation"
              : "Create a new wiki document"}
            {createParentId ? " as a child of the selected document" : ""}.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            if (v === "regular" || v === "template") {
              setMode(v)
              setError(null)
            }
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="regular" className="flex-1">
              Blank document
            </TabsTrigger>
            <TabsTrigger value="template" className="flex-1">
              From template
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {mode === "regular" ? (
            <div className="flex items-center gap-2">
              <DocumentIconPicker value={iconValue} onSelect={handleIconSelect} />
              <Input
                name="title"
                placeholder="Document title"
                required
                autoFocus
                maxLength={200}
                className="flex-1"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Same icon + title row as Blank mode, so a forked document's name
                  and icon are both editable. The icon picker is seeded from the
                  picked template via selectTemplate but can be overridden here. */}
              <div className="flex items-center gap-2">
                <DocumentIconPicker value={iconValue} onSelect={handleIconSelect} />
                <Input
                  value={instanceTitle}
                  onChange={(e) => {
                    setInstanceTitle(e.target.value)
                    setTitleDirty(true)
                  }}
                  placeholder={
                    templateId ? "Document name" : "Pick a template below"
                  }
                  maxLength={200}
                  aria-label="New document name"
                  className="flex-1"
                />
              </div>
              <SearchInput
                value={templateQuery}
                onValueChange={setTemplateQuery}
                placeholder="Search templates…"
                className="relative w-full"
              />
              <div className="max-h-72 overflow-y-auto rounded-md border">
                {tplLoading ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    Loading templates…
                  </p>
                ) : templates.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    {templateQuery
                      ? "No matching templates"
                      : "No templates yet"}
                  </p>
                ) : (
                  <ul className="flex flex-col p-1">
                    {templates.map((tpl) => {
                      const selected = templateId === tpl.id
                      return (
                        <li key={tpl.id}>
                          <button
                            type="button"
                            data-selected={selected}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent data-[selected=true]:bg-accent data-[selected=true]:ring-1 data-[selected=true]:ring-primary"
                            onClick={() =>
                              selectTemplate({
                                id: tpl.id,
                                title: tpl.title,
                                emoji: tpl.emoji,
                                icon: tpl.icon,
                                color: tpl.color,
                              })
                            }
                          >
                            <DocumentIcon
                              emoji={tpl.emoji}
                              icon={tpl.icon}
                              color={tpl.color}
                              hasChildren={false}
                              isExpanded={false}
                            />
                            <span className="flex-1 truncate">
                              {tpl.title || "Untitled"}
                            </span>
                            {/* Source hint: templates can come from the scoped
                                operation or the global Public tree — label the
                                Public ones so the origin is unambiguous. */}
                            {isPublicOperation(tpl.operationId) && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {PUBLIC_OPERATION_NAME}
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {isPending
                ? "Creating..."
                : mode === "template"
                  ? "Create from template"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
