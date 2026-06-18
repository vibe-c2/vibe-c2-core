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
            {values.length} {values.length === 1 ? "entry" : "entries"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {data.kind === "leaf-subnets"
            ? data.entries.map((e) => (
                <div
                  key={`${e.iface}|${e.cidr}`}
                  className="flex items-center gap-2 border-b px-3 py-1.5 last:border-b-0"
                >
                  <span
                    className="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground"
                    title={e.iface}
                  >
                    {e.iface}
                  </span>
                  <ValueRow value={e.cidr} label="CIDR" className="flex-1" />
                  <ValueRow value={e.ip} label="IP" className="flex-1" />
                </div>
              ))
            : values.map((value) => (
                <div key={value} className="border-b px-3 py-1.5 last:border-b-0">
                  <ValueRow
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

// One value as plain text with a dedicated copy button on the right. The text
// itself is selectable (not a click target) so an operator can also drag-select
// part of it; the button is the explicit copy affordance.
function ValueRow({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="flex-1 truncate font-mono text-sm" title={value}>
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => copyToClipboard(value, label)}
        title={`Copy ${label}`}
        className="shrink-0 text-muted-foreground"
      >
        <CopyIcon />
        <span className="sr-only">Copy {label}</span>
      </Button>
    </div>
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
