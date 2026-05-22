import { GemIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { useFindingsStore } from "@/stores/findings"
import { CredentialsTab } from "@/components/findings/credentials-tab"
import type { FindingsMode } from "@/components/findings/findings-mode"

export function FindingsPage() {
  const scopedOperation = useScopedOperation()

  // No redirect: when no operation is scoped, Findings switches to its
  // "global / cross-operation" mode where the user can search across the
  // operations they belong to. See FindingsMode.
  const mode: FindingsMode = scopedOperation
    ? { kind: "scoped", operationId: scopedOperation.id }
    : // operationIds is owned by useFindingsOpsParam in the inner tab; the
      // page-level mode only carries the discriminant. The actual selection
      // lives in URL search params (?ops=...).
      { kind: "global", operationIds: null }

  return <FindingsPageInner mode={mode} />
}

function FindingsPageInner({ mode }: { mode: FindingsMode }) {
  usePageMetadata({
    title: mode.kind === "scoped" ? "Findings" : "Findings · Global",
    icon: { kind: "lucide", component: GemIcon },
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

      {activeTab === "credentials" && <CredentialsTab mode={mode} />}
    </div>
  )
}
