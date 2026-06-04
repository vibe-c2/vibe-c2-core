import { KanbanSquareIcon, LayoutGridIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/ui/search-input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { useTaskStore } from "@/stores/tasks"
import { useTaskChangedSubscription } from "@/graphql/hooks/tasks"
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog"
import { KanbanBoard } from "@/components/tasks/kanban-board"
import { RiskProfitMatrix } from "@/components/tasks/risk-profit-matrix"
// Credential chips inside the task edit dialog open the same details / edit /
// delete modals used on the findings and wiki pages. Mount them here so the
// store-driven openers actually have a target on this page.
import { CredentialDetailsDialog } from "@/components/findings/credential-details-dialog"
import { EditCredentialDialog } from "@/components/findings/edit-credential-dialog"
import { DeleteCredentialDialog } from "@/components/findings/delete-credential-dialog"
import { cn } from "@/lib/utils"

export function TasksPage() {
  const scopedOperation = useScopedOperation()

  usePageMetadata({
    title: scopedOperation ? `Tasks · ${scopedOperation.name}` : "Tasks",
    icon: { kind: "lucide", component: KanbanSquareIcon },
  })

  // Deep-link sync and the EditTaskDialog itself are mounted globally in
  // AppLayout so click-to-open works from the wiki and credential surfaces
  // too. This page only owns the CreateTaskDialog (it needs the scoped
  // operation) and the dialogs that mount on top of edit while staying
  // session-scoped to the kanban flow.

  // The Tasks feature is operation-scoped — there is no global aggregate
  // (per the spec / user decision). When no operation is scoped, prompt
  // the user to pick one via the operation switcher.
  if (!scopedOperation) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <KanbanSquareIcon className="mx-auto mb-3 size-10 text-muted-foreground" />
          <h2 className="text-lg font-medium">No operation selected</h2>
          <p className="text-sm text-muted-foreground">
            Pick an operation from the switcher above to plan and track tasks.
          </p>
        </div>
      </div>
    )
  }

  return <TasksPageInner operationId={scopedOperation.id} />
}

function TasksPageInner({ operationId }: { operationId: string }) {
  const viewMode = useTaskStore((s) => s.viewMode)
  const setViewMode = useTaskStore((s) => s.setViewMode)
  const search = useTaskStore((s) => s.filters.search)
  const setSearch = useTaskStore((s) => s.setSearch)
  const matrixIncludeBacklog = useTaskStore((s) => s.matrixIncludeBacklog)
  const setMatrixIncludeBacklog = useTaskStore(
    (s) => s.setMatrixIncludeBacklog,
  )
  const openCreateDialog = useTaskStore((s) => s.openCreateDialog)

  // Realtime board updates — invalidates per-column / per-quadrant lists
  // whenever any task in the operation changes, soft-deletes, or restores.
  // Hot-update of the details cache happens in the hook itself.
  useTaskChangedSubscription(operationId)

  return (
    <div className="flex flex-1 flex-col gap-2 p-2 min-h-0">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search tasks…"
            className="relative w-64"
          />
          <ViewToggle
            mode={viewMode}
            onChange={setViewMode}
          />
          {viewMode === "matrix" && (
            <div className="flex items-center gap-2 pl-1">
              <Switch
                id="matrix-include-backlog"
                checked={matrixIncludeBacklog}
                onCheckedChange={setMatrixIncludeBacklog}
              />
              <Label
                htmlFor="matrix-include-backlog"
                className="text-xs text-muted-foreground"
              >
                Include backlog
              </Label>
            </div>
          )}
        </div>
        <Button size="sm" onClick={() => openCreateDialog()}>
          <PlusIcon className="size-4" />
          New task
        </Button>
      </header>

      {/* min-w-0 + min-h-0 so the inner board's overflow-x-auto can shrink
          its allotted width and produce a horizontal scrollbar. Without
          this, flex children default to min-width:auto and the board's
          intrinsic min content (4 columns) pushes past the viewport,
          clipping rightmost columns under the parent's overflow-hidden. */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0 min-h-0">
        {viewMode === "kanban" ? (
          <KanbanBoard operationId={operationId} search={search} />
        ) : (
          <RiskProfitMatrix
            operationId={operationId}
            search={search}
            includeBacklog={matrixIncludeBacklog}
          />
        )}
      </div>

      {/* Create dialog stays here — it needs the page's scoped operation
          and there is no cross-domain entry point that opens it. Edit/Delete
          /StatusRequired/Reopen are mounted globally in AppLayout. */}
      <CreateTaskDialog operationId={operationId} />
      <CredentialDetailsDialog />
      <EditCredentialDialog />
      <DeleteCredentialDialog />
    </div>
  )
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: "kanban" | "matrix"
  onChange: (mode: "kanban" | "matrix") => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
      <button
        type="button"
        onClick={() => onChange("kanban")}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
          mode === "kanban"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <KanbanSquareIcon className="size-3.5" />
        Kanban
      </button>
      <button
        type="button"
        onClick={() => onChange("matrix")}
        className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
          mode === "matrix"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <LayoutGridIcon className="size-3.5" />
        Matrix
      </button>
    </div>
  )
}

