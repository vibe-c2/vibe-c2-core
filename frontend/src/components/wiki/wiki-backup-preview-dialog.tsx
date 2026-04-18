import { useMemo } from "react"
import { diffLines } from "diff"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useWikiStore, type BackupConfirmTarget } from "@/stores/wiki"
import { useWikiDocument, useWikiDocumentBackup } from "@/graphql/hooks/wiki"
import { relativeTime, formatAbsolute } from "@/lib/relative-time"
import { formatBytes } from "@/lib/format-bytes"
import { getBackupVisual } from "./wiki-backup-visual"

// Unified line-level diff between a backup and the current document. Uses
// jsdiff's `diffLines` so context + added + removed lines render in one
// scrollable column (code-review style). Side-by-side was dropped because
// a diff dialog's job is to answer "what changed", which a unified view
// does in a fraction of the width.
export function WikiBackupPreviewDialog() {
  const { backupPreviewId, closeBackupPreview, openBackupConfirm } = useWikiStore()
  const open = !!backupPreviewId

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeBackupPreview()}>
      {/* Responsive variant — base DialogContent ships with sm:max-w-sm,
          so a plain max-w-4xl loses the cascade; sm:max-w-4xl wins. */}
      <DialogContent className="sm:max-w-4xl">
        {backupPreviewId ? (
          <PreviewBody
            backupId={backupPreviewId}
            onClose={closeBackupPreview}
            onRestore={openBackupConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type DiffKind = "context" | "add" | "remove"

interface DiffLine {
  kind: DiffKind
  text: string
}

function PreviewBody({
  backupId,
  onClose,
  onRestore,
}: {
  backupId: string
  onClose: () => void
  onRestore: (target: BackupConfirmTarget) => void
}) {
  const { data: backupData, isLoading: backupLoading } = useWikiDocumentBackup(backupId)
  const backup = backupData?.wikiDocumentBackup
  const documentId = backup?.documentId
  const { data: docData, isLoading: docLoading } = useWikiDocument(documentId ?? "")
  const current = docData?.wikiDocument

  const diff = useMemo(() => {
    if (!backup || !current) return null
    return computeDiff(backup.content ?? "", current.content ?? "")
  }, [backup, current])

  if (backupLoading || !backup) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>Backup preview</DialogTitle>
          <DialogDescription>Loading snapshot…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-80 w-full rounded" />
      </div>
    )
  }

  const visual = getBackupVisual(backup)
  const Icon = visual.Icon
  const backupSize = formatBytes(backup.contentLength)
  const currentSize = current ? formatBytes(current.contentLength) : null

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Icon className={`size-4 shrink-0 ${visual.iconClass}`} aria-hidden />
          <span className="truncate">{backup.title || "Untitled"}</span>
        </DialogTitle>
        <DialogDescription>
          Line-level diff between this snapshot and the current document.
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span className="text-foreground" title={formatAbsolute(backup.createdAt)}>
            {relativeTime(backup.createdAt)}
          </span>
          <span aria-hidden>·</span>
          <span>{visual.label}</span>
          <span aria-hidden>·</span>
          <span>by {backup.createdBy?.username ?? "system"}</span>
          <span aria-hidden>·</span>
          <span>
            {backupSize}
            {currentSize ? ` (now ${currentSize})` : ""}
          </span>
          <span aria-hidden>·</span>
          <DiffSummary diff={diff} loading={docLoading && !diff} />
          {backup.description ? (
            <>
              <span aria-hidden>·</span>
              <span className="italic">&ldquo;{backup.description}&rdquo;</span>
            </>
          ) : null}
        </div>
      </DialogHeader>

      <div className="max-h-[60vh] min-h-[20vh] overflow-auto rounded-md border bg-muted/20 font-mono text-xs leading-[1.45]">
        {docLoading && !diff ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : diff && diff.lines.length > 0 ? (
          <DiffBody lines={diff.lines} />
        ) : (
          <p className="px-3 py-6 text-center italic text-muted-foreground">
            Both versions are empty.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (!documentId) return
            onRestore({
              backupId: backup.id,
              documentId,
              action: "restore",
              createdAt: backup.createdAt,
              trigger: backup.trigger,
              description: backup.description,
            })
          }}
        >
          Restore this backup
        </Button>
      </DialogFooter>
    </>
  )
}

function DiffSummary({
  diff,
  loading,
}: {
  diff: { adds: number; removes: number } | null
  loading: boolean
}) {
  if (loading) return <span className="italic">computing diff…</span>
  if (!diff) return null
  if (diff.adds === 0 && diff.removes === 0) {
    return <span className="italic">identical</span>
  }
  return (
    <span>
      <span className="text-emerald-700 dark:text-emerald-400">+{diff.adds}</span>{" "}
      <span className="text-rose-700 dark:text-rose-400">−{diff.removes}</span> since
      snapshot
    </span>
  )
}

function DiffBody({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="divide-y divide-border/40">
      {lines.map((line, i) => (
        <div key={i} className={rowClass(line.kind)}>
          <span className="w-6 shrink-0 select-none text-center text-muted-foreground/50">
            {prefix(line.kind)}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words px-2">
            {isVisuallyBlank(line.text) ? (
              <span className="select-none text-muted-foreground/40">\n</span>
            ) : (
              renderLine(line.text)
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// TipTap's serializer pads empty paragraphs with runs of non-breaking
// spaces; treat anything that contains only whitespace (spaces, tabs,
// nbsp, zero-width, BOM) as a blank line for display. The raw text is
// still what `diffLines` compares against, so a nbsp-padded line that
// differs from a plain-empty one will still show red/green.
function isVisuallyBlank(text: string): boolean {
  if (text === "") return true
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    const isWs =
      code === 9 || // tab
      code === 10 || // lf (shouldn't occur — split)
      code === 13 || // cr
      code === 32 || // space
      code === 160 || // nbsp
      code === 8203 || // zero-width space
      code === 65279 // bom
    if (!isWs) return false
  }
  return true
}

// Strip trailing invisible whitespace (spaces, tabs, nbsp, zwsp, BOM) for
// display only — TipTap pads the end of paragraphs with long nbsp runs
// that would otherwise visually wrap the row into many lines. `diffLines`
// still operates on the raw content, so real differences are preserved.
function renderLine(text: string): React.ReactNode {
  const match = text.match(/^(.*?)([\s\u00A0\u200B\uFEFF]+)$/)
  if (!match || match[1].length === 0) {
    // All whitespace (handled by the blank-line branch) or no trailing
    // whitespace — render as-is.
    return text
  }
  const trimmed = match[1]
  const stripped = match[2].length
  return (
    <>
      {trimmed}
      <span
        className="select-none text-muted-foreground/30"
        title={`${stripped} trailing invisible chars hidden`}
      >
        {` ⏎${stripped > 1 ? `×${stripped}` : ""}`}
      </span>
    </>
  )
}

function rowClass(kind: DiffKind): string {
  switch (kind) {
    case "add":
      return "flex bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
    case "remove":
      return "flex bg-rose-500/10 text-rose-900 dark:text-rose-200"
    default:
      return "flex"
  }
}

function prefix(kind: DiffKind): string {
  switch (kind) {
    case "add":
      return "+"
    case "remove":
      return "−"
    default:
      return " "
  }
}

function computeDiff(
  before: string,
  after: string,
): { lines: DiffLine[]; adds: number; removes: number } {
  // Normalize CRLF / CR-only line endings before diffing. CSS
  // `white-space: pre-wrap` renders a lone `\r` as a hard line break,
  // so a stray `\r` left on a row would double its visual height.
  const a = before.replace(/\r\n?/g, "\n")
  const b = after.replace(/\r\n?/g, "\n")
  const parts = diffLines(a, b)
  const out: DiffLine[] = []
  let adds = 0
  let removes = 0
  for (const part of parts) {
    // Split the chunk back into per-line entries, dropping the trailing
    // empty string that comes from a chunk that ends in "\n".
    const raw = part.value.split("\n")
    if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop()
    const kind: DiffKind = part.added ? "add" : part.removed ? "remove" : "context"
    for (const text of raw) {
      out.push({ kind, text })
      if (kind === "add") adds++
      else if (kind === "remove") removes++
    }
  }
  return { lines: out, adds, removes }
}
