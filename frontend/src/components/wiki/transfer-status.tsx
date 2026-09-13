// Small presentational pieces shared by the export and import dialogs:
// a progress line for a running job, and the collapsible skipped/warned
// lists a finished job's report carries.

import type { SkipRecord } from "@/lib/wiki-transfer"

interface TransferProgressProps {
  label: string
  done: number
  total: number
}

export function TransferProgress({ label, done, total }: TransferProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">
        {label}
        {total > 0 ? ` — ${done} of ${total} pages` : "…"}
      </p>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        You can close this window; the job keeps running.
      </p>
    </div>
  )
}

interface TransferSkipListProps {
  skipped?: SkipRecord[]
  warnings?: SkipRecord[]
}

export function TransferSkipList({ skipped, warnings }: TransferSkipListProps) {
  return (
    <>
      {skipped && skipped.length > 0 && (
        <details className="rounded-md border p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            {skipped.length} skipped — see details
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {skipped.map((s, i) => (
              <li key={i}>
                <span className="font-mono">{s.path}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {warnings && warnings.length > 0 && (
        <details className="rounded-md border p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            {warnings.length} warning{warnings.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {warnings.map((w, i) => (
              <li key={i}>
                <span className="font-mono">{w.path}</span> — {w.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
