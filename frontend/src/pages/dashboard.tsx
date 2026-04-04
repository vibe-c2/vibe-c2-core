import { Navigate } from "react-router"
import { SwordsIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"

export function DashboardPage() {
  const scopedOperation = useScopedOperation()

  // No operation scoped — redirect to operations page so the user can pick one.
  if (!scopedOperation) {
    return <Navigate to="/operations" replace />
  }

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
        <SwordsIcon className="size-4 text-primary" />
        <span>
          Operation: <span className="font-medium text-foreground">{scopedOperation.name}</span>
        </span>
      </div>
      <div className="grid auto-rows-min gap-2 md:grid-cols-3">
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
        <div className="aspect-video rounded-xl bg-muted/50" />
      </div>
      <div className="min-h-[50vh] flex-1 rounded-xl bg-muted/50" />
    </div>
  )
}
