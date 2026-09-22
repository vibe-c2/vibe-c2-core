// What an operator sees on Tasks before anything is scoped.
//
// This replaced a single centered line of muted text telling people to "pick
// an operation from the switcher above" — advice that named no control the
// reader could identify, and that was simply wrong for anyone who belongs to
// no operation yet. It is deliberately not a one-shot: the tour can be
// dismissed, this cannot, so there is always somewhere to come back to.

import { ArrowRightIcon, BookOpenIcon, PlusIcon, SwordsIcon, UsersIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth"
import { Permissions } from "@/constants/permissions"
import { useInfiniteOperations } from "@/graphql/hooks/operations"
import { useOperationStore } from "@/stores/operations"
import { useScopedOperationStore } from "@/stores/scoped-operation"
import { useOnboardingStore } from "@/stores/onboarding"
import { CreateOperationDialog } from "@/components/operations/create-operation-dialog"
import {
  gettingStartedVariant,
  type GettingStartedVariant,
} from "@/components/onboarding/getting-started"

/** How many operations to offer inline before deferring to the switcher. */
const INLINE_OPERATION_LIMIT = 5

export function GettingStartedPanel() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const scopeOperation = useScopedOperationStore((s) => s.scopeOperation)
  const openCreateDialog = useOperationStore((s) => s.openCreateDialog)
  const startTour = useOnboardingStore((s) => s.start)

  // Same query variables the operation switcher uses, so the two share one
  // cache entry: this panel warms the switcher's list, and opening it right
  // after is instant rather than a spinner.
  const { data, isLoading } = useInfiniteOperations({ search: null, first: 20 })

  const operations =
    data?.pages.flatMap((page) => page.operations.edges.map((edge) => edge.node)) ?? []
  const operationCount = data?.pages[0]?.operations.totalCount ?? 0

  // Nothing is asserted while the count is unknown: guessing "you have no
  // operations" and correcting it a moment later is worse than a blank beat.
  if (isLoading) return <PanelFrame />

  const variant = gettingStartedVariant({
    operationCount,
    canCreateOperation: hasPermission(Permissions.OPERATION_CREATE),
  })

  return (
    <PanelFrame>
      <PanelHeading variant={variant} />

      {variant === "choose" && (
        <>
          <ul className="flex flex-col gap-1.5">
            {operations.slice(0, INLINE_OPERATION_LIMIT).map((op) => (
              <li key={op.id}>
                <button
                  type="button"
                  onClick={() =>
                    scopeOperation({
                      id: op.id,
                      name: op.name,
                      description: op.description ?? "",
                    })
                  }
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <SwordsIcon className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">{op.name}</span>
                    {op.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {op.description}
                      </span>
                    ) : null}
                  </span>
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
          {operationCount > INLINE_OPERATION_LIMIT && (
            <p className="text-xs text-muted-foreground">
              {operationCount - INLINE_OPERATION_LIMIT} more in the switcher at the top of
              the sidebar.
            </p>
          )}
          {/* The way back in for anyone who skipped the walkthrough, or who
              wants it again on a second engagement. */}
          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={() => startTour("welcome")}>
              Show me around
            </Button>
          </div>
        </>
      )}

      {variant === "create" && (
        <>
          <Button size="sm" className="self-start" onClick={openCreateDialog}>
            <PlusIcon className="size-4" />
            Create an operation
          </Button>
          {/* Mounted here rather than relying on the operations page: this
              panel is often the first surface an admin ever sees, and the
              dialog is store-driven so it works anywhere it is mounted. */}
          <CreateOperationDialog />
        </>
      )}

      {variant === "request" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5 ring-1 ring-foreground/10">
            <UsersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Only an operation admin can add you. Once they do, the operation appears in
              the switcher at the top of the sidebar and everything here unlocks.
            </p>
          </div>
          <Button variant="outline" size="sm" className="self-start" render={<Link to="/wiki" />}>
            <BookOpenIcon className="size-4" />
            Browse the public wiki
          </Button>
        </div>
      )}
    </PanelFrame>
  )
}

/** Shared chrome. Left-aligned and column-width rather than a centred block:
 *  this is something to read and act on, not a status message. */
function PanelFrame({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6 sm:p-10">
      <div className="flex w-full max-w-xl flex-col gap-4">{children}</div>
    </div>
  )
}

function PanelHeading({ variant }: { variant: GettingStartedVariant }) {
  const copy: Record<GettingStartedVariant, { title: string; body: string }> = {
    choose: {
      title: "Pick an operation to start working",
      body: "Tasks, the timeline and every wiki page belong to one operation. Choose the one you are working on and the rest of the app fills in around it.",
    },
    create: {
      title: "Create your first operation",
      body: "An operation is the container for a single engagement: its tasks, timeline, findings and wiki all live inside it. Nothing else in the app has anywhere to go until one exists.",
    },
    request: {
      title: "You are not in an operation yet",
      body: "Work in Vibe C2 happens inside an operation, and membership is granted rather than requested.",
    },
  }

  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight">{copy[variant].title}</h1>
      <p className="text-sm text-muted-foreground">{copy[variant].body}</p>
    </header>
  )
}
