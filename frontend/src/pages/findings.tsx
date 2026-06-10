import { GemIcon } from "lucide-react"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import { useCredentialDeepLink } from "@/hooks/use-credential-deep-link"
import { useHashDeepLink } from "@/hooks/use-hash-deep-link"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { useFindingsStore } from "@/stores/findings"
import { CredentialDetailsDialog } from "@/components/findings/credential-details-dialog"
import { CredentialsTab } from "@/components/findings/credentials-tab"
import { HashesTab } from "@/components/findings/hashes-tab"
import { HostsTab } from "@/components/findings/hosts-tab"
import type { FindingsMode } from "@/components/findings/findings-mode"

export function FindingsPage() {
  const scopedOperation = useScopedOperation()

  // No redirect: when no operation is scoped, Findings switches to its
  // "global / cross-operation" mode where the user can search across the
  // operations they belong to. See FindingsMode.
  const mode: FindingsMode = scopedOperation
    ? { kind: "scoped", operationId: scopedOperation.id }
    : { kind: "global", operationIds: null }

  return <FindingsPageInner mode={mode} />
}

function FindingsPageInner({ mode }: { mode: FindingsMode }) {
  usePageMetadata({
    title: mode.kind === "scoped" ? "Findings" : "Findings · Global",
    icon: { kind: "lucide", component: GemIcon },
  })

  // Two-way sync between `?credential=<id>` / `?hash=<id>` and the matching
  // details dialog. Both hooks also force their respective tab active so the
  // dialog isn't hidden behind a different one.
  useCredentialDeepLink()
  useHashDeepLink()

  const activeTab = useFindingsStore((s) => s.activeTab)
  const setActiveTab = useFindingsStore((s) => s.setActiveTab)

  // Hosts only exist scoped to one operation — a cross-operation hosts view
  // would collide because target networks reuse the same private IP ranges.
  // In global mode the tab button is hidden and a persisted "hosts" selection
  // is coerced to credentials at render time. The store keeps "hosts" so
  // returning to a scoped operation restores the operator's tab choice.
  const effectiveTab =
    activeTab === "hosts" && mode.kind === "global" ? "credentials" : activeTab

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <div className="flex gap-1 border-b pb-1">
        <TabButton
          active={effectiveTab === "credentials"}
          onClick={() => setActiveTab("credentials")}
        >
          Credentials
        </TabButton>
        <TabButton
          active={effectiveTab === "hashes"}
          onClick={() => setActiveTab("hashes")}
        >
          Hashes
        </TabButton>
        {mode.kind === "scoped" && (
          <TabButton
            active={effectiveTab === "hosts"}
            onClick={() => setActiveTab("hosts")}
          >
            Hosts
          </TabButton>
        )}
      </div>

      {effectiveTab === "credentials" && <CredentialsTab mode={mode} />}
      {effectiveTab === "hashes" && <HashesTab mode={mode} />}
      {effectiveTab === "hosts" && mode.kind === "scoped" && (
        <HostsTab operationId={mode.operationId} />
      )}

      {/* Mounted at the page level so the credential details modal opens
          regardless of the active tab — e.g. clicking a linked credential
          chip from inside the hash details dialog. */}
      <CredentialDetailsDialog />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
