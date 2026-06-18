import { CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { copyToClipboard } from "@/lib/copy-to-clipboard"
import { cn } from "@/lib/utils"
import type { AggregateMenuData } from "@/components/findings/topology/node-context-menu"

// What the topology view hands the dialog: the aggregate node's title plus its
// collapsed members. The lens folds these members into a single canvas node, so
// this read-only dialog is the only place an operator can read or copy them.
export interface AggregateViewState {
  title: string
  data: AggregateMenuData
}

interface AggregateViewDialogProps {
  view: AggregateViewState
  onClose: () => void
}

export function AggregateViewDialog({ view, onClose }: AggregateViewDialogProps) {
  const { title, data } = view
  // The primary value of each member — drives the count, the string-list rows,
  // and (joined) "Copy all". leaf-subnets renders its own richer rows below.
  const values = aggregateValues(data)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {values.length} {values.length === 1 ? "entry" : "entries"} — click
            any value to copy it.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {data.kind === "leaf-subnets"
            ? data.entries.map((e) => (
                <div
                  key={`${e.iface}|${e.cidr}`}
                  className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0"
                >
                  <span
                    className="w-20 shrink-0 truncate font-mono text-[11px] text-muted-foreground"
                    title={e.iface}
                  >
                    {e.iface}
                  </span>
                  <CopyValue value={e.cidr} label="CIDR" className="flex-1" />
                  <CopyValue value={e.ip} label="IP" className="flex-1" />
                </div>
              ))
            : values.map((value) => (
                <div key={value} className="border-b px-3 py-2 last:border-b-0">
                  <CopyValue
                    value={value}
                    label={data.kind === "lone-sources" ? "source" : "account"}
                  />
                </div>
              ))}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => copyToClipboard(copyAllText(data), "all")}
          >
            <CopyIcon className="size-3.5" />
            Copy all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// One copyable value: the whole row is the click target so it stays easy to hit
// on a touchpad, with the icon as the affordance.
function CopyValue({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => copyToClipboard(value, label)}
      title={`Copy ${label}`}
      className={cn(
        "group flex items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-muted",
        className,
      )}
    >
      <span className="truncate font-mono text-xs">{value}</span>
      <CopyIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}

// The primary, identifying value of each member — the count, the string-list
// rows, and each leaf-subnet's CIDR. (leaf-subnets also exposes a per-row IP.)
function aggregateValues(data: AggregateMenuData): string[] {
  switch (data.kind) {
    case "leaf-subnets":
      return data.entries.map((e) => e.cidr)
    case "lone-sources":
      return data.labels
    case "local-identities":
      return data.users
  }
}

// "Copy all" payload — lossless, unlike the primary-value list: leaf-subnets
// keeps both CIDR and IP per line so the IP column isn't silently dropped.
function copyAllText(data: AggregateMenuData): string {
  if (data.kind === "leaf-subnets") {
    return data.entries.map((e) => `${e.cidr}\t${e.ip}`).join("\n")
  }
  return aggregateValues(data).join("\n")
}
