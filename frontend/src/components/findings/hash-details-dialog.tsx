import {
  ExternalLinkIcon,
  KeyIcon,
  PencilIcon,
  Trash2Icon,
  SwordsIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useHashStore } from "@/stores/hashes"
import { useHash } from "@/graphql/hooks/hashes"
import { useCredentialStore } from "@/stores/credentials"
import {
  hashStatusBadgeClass,
  hashStatusLabel,
} from "@/components/findings/hash-status-utils"

export function HashDetailsDialog() {
  const {
    detailsPanelOpen,
    closeDetailsPanel,
    selected,
    openEditDialog,
    openDeleteDialog,
    openMarkCrackedDialog,
  } = useHashStore()
  const openCredentialDetails = useCredentialStore((s) => s.openDetailsPanel)
  const hashQuery = useHash(selected?.id ?? "", { enabled: !!selected?.id })
  const hash = hashQuery.data?.hash

  if (!selected) return null

  return (
    <Dialog
      open={detailsPanelOpen}
      onOpenChange={(open) => {
        if (!open) closeDetailsPanel()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{hash?.username || selected.label}</span>
            {hash && (
              <Badge
                variant="outline"
                className={hashStatusBadgeClass(hash.status)}
              >
                {hashStatusLabel(hash.status)}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {hashQuery.isLoading || !hash ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Type">
                <Badge variant="outline">{hash.hashType}</Badge>
                {hash.hashcatMode > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    hashcat -m {hash.hashcatMode}
                  </span>
                )}
              </Field>
              <Field label="Username">
                {hash.username || (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
              <Field label="Domain">
                {hash.domain || (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
              <Field label="Source">
                {hash.source || (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
            </div>

            <Field label="Value">
              <code className="block break-all rounded-md bg-muted p-2 font-mono text-xs">
                {hash.value}
              </code>
            </Field>

            {hash.tags.length > 0 && (
              <Field label="Tags">
                <div className="flex flex-wrap gap-1">
                  {hash.tags.map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
              </Field>
            )}

            {hash.properties.length > 0 && (
              <Field label="Properties">
                <dl className="grid gap-1 text-xs sm:grid-cols-2">
                  {hash.properties.map((p) => (
                    <div key={p.name} className="flex gap-2">
                      <dt className="font-medium text-muted-foreground">
                        {p.name}
                      </dt>
                      <dd className="break-all">{p.value}</dd>
                    </div>
                  ))}
                </dl>
              </Field>
            )}

            {hash.credentialId && hash.credential && (
              <Field label="Linked credential">
                <button
                  type="button"
                  onClick={() => {
                    openCredentialDetails({
                      id: hash.credential!.id,
                      name: hash.credential!.name,
                    })
                  }}
                  className="inline-flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm hover:bg-muted"
                >
                  <KeyIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-medium">{hash.credential.name}</span>
                  {hash.credential.username && (
                    <span className="text-muted-foreground">
                      ({hash.credential.username})
                    </span>
                  )}
                  <ExternalLinkIcon className="size-3 text-muted-foreground" />
                </button>
              </Field>
            )}

            {hash.crackingMeta && (
              <Field label="Cracked">
                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  <div>
                    {hash.crackingMeta.crackedBy?.username ?? "Unknown"} ·{" "}
                    <FormattedDateTimeText
                      date={hash.crackingMeta.crackedAt}
                    />
                  </div>
                  {(hash.crackingMeta.tool ||
                    hash.crackingMeta.wordlist ||
                    hash.crackingMeta.rules) && (
                    <div className="mt-1 text-muted-foreground">
                      {[
                        hash.crackingMeta.tool,
                        hash.crackingMeta.wordlist,
                        hash.crackingMeta.rules,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {hash.crackingMeta.durationSec > 0 &&
                        ` · ${hash.crackingMeta.durationSec}s`}
                    </div>
                  )}
                </div>
              </Field>
            )}

            {hash.operation && (
              <Field label="Operation">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <SwordsIcon className="size-3.5" />
                  {hash.operation.name}
                </span>
              </Field>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {hash.status !== "CRACKED" && (
                <Button
                  onClick={() =>
                    openMarkCrackedDialog({
                      id: hash.id,
                      label: hash.username || hash.hashType,
                    })
                  }
                >
                  <KeyIcon className="size-4" />
                  Mark as cracked
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  openEditDialog({
                    id: hash.id,
                    label: hash.username || hash.hashType,
                  })
                }
              >
                <PencilIcon className="size-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  openDeleteDialog({
                    id: hash.id,
                    label: hash.username || hash.hashType,
                  })
                }
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Delete
              </Button>
              <div className="ms-auto text-xs text-muted-foreground">
                Added{" "}
                <FormattedDateTimeText date={hash.createdAt} /> by{" "}
                {hash.createdBy?.username ?? "—"}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}
