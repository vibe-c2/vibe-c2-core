import { Navigate } from "react-router"
import { SearchCheckIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { useFindingsStore } from "@/stores/findings"
import { CredentialsTab } from "@/components/findings/credentials-tab"

export function FindingsPage() {
  const scopedOperation = useScopedOperation()

  // Redirect if no operation is scoped — Findings is operation-scoped.
  if (!scopedOperation) {
    return <Navigate to="/operations" replace />
  }

  return <FindingsPageInner operationId={scopedOperation.id} />
}

function FindingsPageInner({ operationId }: { operationId: string }) {
  usePageMetadata({
    title: "Findings",
    icon: { kind: "lucide", component: SearchCheckIcon },
  })

  const activeTab = useFindingsStore((s) => s.activeTab)
  const setActiveTab = useFindingsStore((s) => s.setActiveTab)

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      {/* Tab switcher — same style as Users page (Users/Sessions). */}
      <div className="flex gap-1 border-b pb-1">
        <button
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === "credentials"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
          onClick={() => setActiveTab("credentials")}
        >
          Credentials
        </button>
        {/* Future tabs (hashes, files, hosts, ...) drop in here with the same shape. */}
      </div>

      {activeTab === "credentials" && <CredentialsTab operationId={operationId} />}
    </div>
  )
}
