import { useMemo } from "react";
import { diffLines } from "diff";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useWikiStore, type BackupConfirmTarget } from "@/stores/wiki";
import { useWikiDocument, useWikiDocumentBackup } from "@/graphql/hooks/wiki";
import { relativeTime, formatAbsolute } from "@/lib/relative-time";
import { formatBytes } from "@/lib/format-bytes";
import { getBackupVisual } from "./wiki-backup-visual";

// Unified line-level diff between a backup and the current document. Uses
// jsdiff's `diffLines` so context + added + removed lines render in one
// scrollable column (code-review style). Unchanged regions are collapsed
// to CONTEXT_LINES around every change block; the elided span is replaced
// with a "··· N lines hidden ···" gap row, GitHub-style.
const CONTEXT_LINES = 5;

export function WikiBackupPreviewDialog() {
  const { backupPreviewId, closeBackupPreview, openBackupConfirm } =
    useWikiStore();
  const open = !!backupPreviewId;

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
  );
}

type ChangeKind = "context" | "add" | "remove";

type DiffRow =
  | { kind: "context"; text: string; oldLine: number; newLine: number }
  | { kind: "add"; text: string; newLine: number }
  | { kind: "remove"; text: string; oldLine: number }
  | { kind: "gap"; hidden: number };

type ChangeRow = Exclude<DiffRow, { kind: "gap" }>;

interface DiffResult {
  rows: DiffRow[];
  adds: number;
  removes: number;
  maxOldLine: number;
  maxNewLine: number;
}

function PreviewBody({
  backupId,
  onClose,
  onRestore,
}: {
  backupId: string;
  onClose: () => void;
  onRestore: (target: BackupConfirmTarget) => void;
}) {
  const { data: backupData, isLoading: backupLoading } =
    useWikiDocumentBackup(backupId);
  const backup = backupData?.wikiDocumentBackup;
  const documentId = backup?.documentId;
  const { data: docData, isLoading: docLoading } = useWikiDocument(
    documentId ?? "",
  );
  const current = docData?.wikiDocument;

  const diff = useMemo<DiffResult | null>(() => {
    if (!backup || !current) return null;
    return computeDiff(backup.content ?? "", current.content ?? "");
  }, [backup, current]);

  if (backupLoading || !backup) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>Backup preview</DialogTitle>
          <DialogDescription>Loading snapshot…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-80 w-full rounded" />
      </div>
    );
  }

  const visual = getBackupVisual(backup);
  const Icon = visual.Icon;
  const backupSize = formatBytes(backup.contentLength);
  // WikiDocument doesn't expose contentLength via GraphQL, so derive it from
  // the fetched content string. Encode as UTF-8 to match server-side bytes.
  const currentSize = current
    ? formatBytes(new TextEncoder().encode(current.content ?? "").byteLength)
    : null;

  // Line-number gutter width sized to the largest line number we'll render.
  // Min 2ch so single-digit files still get a stable column.
  const lineNumDigits = diff
    ? Math.max(2, String(Math.max(diff.maxOldLine, diff.maxNewLine, 1)).length)
    : 2;

  const bothEmpty = !(backup.content ?? "") && !(current?.content ?? "");

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
          <span
            className="text-foreground"
            title={formatAbsolute(backup.createdAt)}
          >
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
        ) : !diff || diff.rows.length === 0 ? (
          <EmptyState bothEmpty={bothEmpty} />
        ) : (
          <DiffBody rows={diff.rows} digits={lineNumDigits} />
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (!documentId) return;
            onRestore({
              backupId: backup.id,
              documentId,
              action: "restore",
              createdAt: backup.createdAt,
              trigger: backup.trigger,
              description: backup.description,
            });
          }}
        >
          Restore this backup
        </Button>
      </DialogFooter>
    </>
  );
}

function DiffSummary({
  diff,
  loading,
}: {
  diff: { adds: number; removes: number } | null;
  loading: boolean;
}) {
  if (loading) return <span className="italic">computing diff…</span>;
  if (!diff) return null;
  if (diff.adds === 0 && diff.removes === 0) {
    return <span className="italic">identical</span>;
  }
  return (
    <span>
      <span className="text-emerald-700 dark:text-emerald-400">
        +{diff.adds}
      </span>{" "}
      <span className="text-rose-700 dark:text-rose-400">−{diff.removes}</span>{" "}
      since snapshot
    </span>
  );
}

function EmptyState({ bothEmpty }: { bothEmpty: boolean }) {
  return (
    <p className="px-3 py-6 text-center italic text-muted-foreground">
      {bothEmpty
        ? "Both versions are empty."
        : "No differences between this snapshot and the current document."}
    </p>
  );
}

function DiffBody({ rows, digits }: { rows: DiffRow[]; digits: number }) {
  return (
    <div className="divide-y divide-border/40">
      {rows.map((row, i) =>
        row.kind === "gap" ? (
          <GapRow key={i} hidden={row.hidden} />
        ) : (
          <ChangeLine key={i} row={row} digits={digits} />
        ),
      )}
    </div>
  );
}

function GapRow({ hidden }: { hidden: number }) {
  return (
    <div className="select-none bg-muted/40 px-3 py-1 text-center text-[11px] italic text-muted-foreground/80">
      <span aria-hidden>···</span>{" "}
      <span>
        {hidden} unchanged {hidden === 1 ? "line" : "lines"} hidden
      </span>{" "}
      <span aria-hidden>···</span>
    </div>
  );
}

function ChangeLine({ row, digits }: { row: ChangeRow; digits: number }) {
  const oldLine = row.kind === "add" ? undefined : row.oldLine;
  const newLine = row.kind === "remove" ? undefined : row.newLine;
  return (
    <div className={rowClass(row.kind)}>
      <LineNumCell value={oldLine} digits={digits} />
      <LineNumCell value={newLine} digits={digits} />
      <span className="w-5 shrink-0 select-none text-center text-muted-foreground/60">
        {prefix(row.kind)}
      </span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-break-word py-0.5 pr-2 pl-1">
        {isVisuallyBlank(row.text) ? (
          // Newline glyph (U+21B5) for blank lines so the row isn't an
          // empty box. Muted + non-selectable so it doesn't bleed into
          // copy-paste.
          <span className="select-none text-muted-foreground/40">↵</span>
        ) : (
          renderLine(row.text)
        )}
      </span>
    </div>
  );
}

function LineNumCell({
  value,
  digits,
}: {
  value: number | undefined;
  digits: number;
}) {
  return (
    <span
      className="shrink-0 select-none border-r border-border/40 px-2 py-0.5 text-right tabular-nums text-muted-foreground/60"
      style={{ width: `${digits + 2}ch` }}
    >
      {value ?? ""}
    </span>
  );
}

// TipTap's serializer pads empty paragraphs with runs of non-breaking
// spaces; treat anything that contains only whitespace (spaces, tabs,
// nbsp, zero-width, BOM) as a blank line for display. The raw text is
// still what `diffLines` compares against, so a nbsp-padded line that
// differs from a plain-empty one will still show red/green.
function isVisuallyBlank(text: string): boolean {
  if (text === "") return true;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isWs =
      code === 9 || // tab
      code === 10 || // lf (shouldn't occur — split)
      code === 13 || // cr
      code === 32 || // space
      code === 160 || // nbsp
      code === 8203 || // zero-width space
      code === 65279; // bom
    if (!isWs) return false;
  }
  return true;
}

// Strip trailing invisible whitespace (spaces, tabs, nbsp, zwsp, BOM) for
// display only — TipTap pads the end of paragraphs with long nbsp runs
// that would otherwise visually wrap the row into many lines. `diffLines`
// still operates on the raw content, so real differences are preserved.
function renderLine(text: string): React.ReactNode {
  const match = text.match(/^(.*?)([\s\u00A0\u200B\uFEFF]+)$/);
  if (!match || match[1].length === 0) {
    // All whitespace (handled by the blank-line branch) or no trailing
    // whitespace — render as-is.
    return text;
  }
  const trimmed = match[1];
  const stripped = match[2].length;
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
  );
}

function rowClass(kind: ChangeKind): string {
  switch (kind) {
    case "add":
      return "flex items-start bg-emerald-500/10 text-emerald-900 dark:text-emerald-200";
    case "remove":
      return "flex items-start bg-rose-500/10 text-rose-900 dark:text-rose-200";
    default:
      return "flex items-start";
  }
}

function prefix(kind: ChangeKind): string {
  switch (kind) {
    case "add":
      return "+";
    case "remove":
      return "−";
    default:
      return " ";
  }
}

function computeDiff(before: string, after: string): DiffResult {
  // Normalize CRLF / CR-only line endings before diffing. CSS
  // `white-space: pre-wrap` renders a lone `\r` as a hard line break,
  // so a stray `\r` left on a row would double its visual height.
  const a = before.replace(/\r\n?/g, "\n");
  const b = after.replace(/\r\n?/g, "\n");
  const parts = diffLines(a, b);
  const full: DiffRow[] = [];
  let adds = 0;
  let removes = 0;
  let oldNum = 0;
  let newNum = 0;
  for (const part of parts) {
    // Split the chunk back into per-line entries, dropping the trailing
    // empty string that comes from a chunk that ends in "\n".
    const raw = part.value.split("\n");
    if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
    if (part.added) {
      for (const text of raw) {
        newNum++;
        full.push({ kind: "add", text, newLine: newNum });
        adds++;
      }
    } else if (part.removed) {
      for (const text of raw) {
        oldNum++;
        full.push({ kind: "remove", text, oldLine: oldNum });
        removes++;
      }
    } else {
      for (const text of raw) {
        oldNum++;
        newNum++;
        full.push({ kind: "context", text, oldLine: oldNum, newLine: newNum });
      }
    }
  }
  return {
    rows: collapseContext(full),
    adds,
    removes,
    maxOldLine: oldNum,
    maxNewLine: newNum,
  };
}

// Collapse runs of unchanged ("context") rows so only CONTEXT_LINES survive
// on each side of every change. Leading context (before the first change)
// keeps only the last CONTEXT_LINES; trailing context keeps only the first
// CONTEXT_LINES; mid-file runs keep both edges. A "gap" row records how many
// lines were elided so the reader can still gauge document scale. If the
// whole file is context (no changes at all), drop everything — the caller
// renders a friendlier "no differences" message instead of a lone gap.
function collapseContext(rows: DiffRow[]): DiffRow[] {
  if (rows.length === 0) return rows;
  const out: DiffRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "context") {
      out.push(rows[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind === "context") j++;
    const run = rows.slice(i, j);
    const isStart = i === 0;
    const isEnd = j === rows.length;
    if (isStart && isEnd) {
      // Identical content — no change to anchor context against. Drop it.
    } else if (isStart) {
      out.push(...trimEdgeContext(run, "leading"));
    } else if (isEnd) {
      out.push(...trimEdgeContext(run, "trailing"));
    } else {
      out.push(...trimMiddleContext(run));
    }
    i = j;
  }
  return out;
}

function trimEdgeContext(
  run: DiffRow[],
  side: "leading" | "trailing",
): DiffRow[] {
  if (run.length <= CONTEXT_LINES) return run;
  const gap: DiffRow = { kind: "gap", hidden: run.length - CONTEXT_LINES };
  return side === "leading"
    ? [gap, ...run.slice(-CONTEXT_LINES)]
    : [...run.slice(0, CONTEXT_LINES), gap];
}

function trimMiddleContext(run: DiffRow[]): DiffRow[] {
  if (run.length <= CONTEXT_LINES * 2) return run;
  const gap: DiffRow = { kind: "gap", hidden: run.length - CONTEXT_LINES * 2 };
  return [
    ...run.slice(0, CONTEXT_LINES),
    gap,
    ...run.slice(-CONTEXT_LINES),
  ];
}
