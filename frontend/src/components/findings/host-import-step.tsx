import { useMemo, useState } from "react"
import { ArrowLeftIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { DialogFooter } from "@/components/ui/dialog"
import { makeClientId } from "@/components/findings/credential-key-drafts"
import type { HostFormValues } from "@/components/findings/host-drafts"
import {
  parseCommandOutput,
  type ParsedLine,
  type ParseResult,
  type SegRole,
} from "@/lib/host-import/parse"

interface HostImportStepProps {
  // A patch over the form values — exactly one category (interfaces OR routes)
  // depending on the pasted command. The dialog merges it, replacing that list.
  onApply: (patch: Partial<Pick<HostFormValues, "interfaces" | "routes">>) => void
  onBack: () => void
}

const PLACEHOLDER = `ip a
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ...
    link/ether 08:00:27:12:34:56 brd ff:ff:ff:ff:ff:ff
    inet 10.0.5.12/24 brd 10.0.5.255 scope global eth0

— or —

ip ro
default via 10.0.5.1 dev eth0 proto dhcp metric 100
10.0.8.0/24 via 10.0.5.1 dev eth0`

const ROLE_CLASS: Record<SegRole, string> = {
  used: "text-emerald-600 dark:text-emerald-400",
  skipped: "text-muted-foreground/60",
  error: "text-destructive underline decoration-wavy underline-offset-2",
}

// The host form's "Magic" step: paste recon command output, see a live
// highlight of what will be imported (used) / ignored (skipped) / rejected
// (error), then commit it back into the form. Pure derivation lives in
// lib/host-import/parse.ts; this is presentation + the parsed→draft bridge.
export function HostImportStep({ onApply, onBack }: HostImportStepProps) {
  const [text, setText] = useState("")
  const result = useMemo(() => parseCommandOutput(text), [text])

  const canParse =
    result.command !== null && result.errorCount === 0 && result.usedCount > 0

  function handleParse() {
    if (!canParse) return
    if (result.command === "ip-addr") {
      onApply({
        interfaces: result.interfaces.map((i) => ({
          _id: makeClientId(),
          name: i.name,
          mac: i.mac,
          addresses: i.addresses.join("\n"),
        })),
      })
    } else {
      onApply({
        routes: result.routes.map((r) => ({
          _id: makeClientId(),
          destination: r.destination,
          gateway: r.gateway,
          interface: r.interface,
        })),
      })
    }
    onBack()
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto px-1">
        <p className="text-sm text-muted-foreground">
          Paste a command and its output (command on the first line). Supported:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">ip a</code> for
          interfaces and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">ip ro</code> for
          routes.
        </p>

        <Textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          autoFocus
          className="font-mono text-xs"
          aria-label="Command and output"
        />

        {text.trim().length > 0 && <Preview result={result} />}
      </div>

      <DialogFooter className="mt-4 sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
        <Button type="button" onClick={handleParse} disabled={!canParse}>
          <SparklesIcon className="size-4" />
          Parse
        </Button>
      </DialogFooter>
    </div>
  )
}

// A line carries no signal worth showing inline when it has no error and every
// segment is skipped (loopback/veth headers, valid_lft lines, on-link routes).
// Long runs of these are collapsed so the few used/error lines stay visible —
// container hosts can have 100+ skipped veth interfaces.
function isSkippedLine(line: ParsedLine): boolean {
  return !line.error && line.segments.every((s) => s.role === "skipped")
}

const RUN_THRESHOLD = 3

type PreviewItem =
  | { kind: "line"; line: ParsedLine; key: number }
  | { kind: "run"; lines: ParsedLine[]; key: number }

function groupLines(lines: ParsedLine[]): PreviewItem[] {
  const items: PreviewItem[] = []
  let run: { line: ParsedLine; idx: number }[] = []
  const flush = () => {
    if (run.length === 0) return
    if (run.length >= RUN_THRESHOLD) {
      items.push({ kind: "run", lines: run.map((r) => r.line), key: run[0].idx })
    } else {
      for (const r of run) items.push({ kind: "line", line: r.line, key: r.idx })
    }
    run = []
  }
  lines.forEach((line, idx) => {
    if (isSkippedLine(line)) {
      run.push({ line, idx })
    } else {
      flush()
      items.push({ kind: "line", line, key: idx })
    }
  })
  flush()
  return items
}

function Preview({ result }: { result: ParseResult }) {
  const items = useMemo(() => groupLines(result.lines), [result.lines])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function toggle(key: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <Legend />
        <Summary result={result} />
      </div>
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded-md border bg-muted/20 p-3 font-mono text-xs leading-relaxed">
        {items.map((item) =>
          item.kind === "line" ? (
            <LineRow key={item.key} line={item.line} />
          ) : (
            <FoldedRun
              key={item.key}
              lines={item.lines}
              expanded={expanded.has(item.key)}
              onToggle={() => toggle(item.key)}
            />
          ),
        )}
      </pre>
    </div>
  )
}

function LineRow({ line }: { line: ParsedLine }) {
  return (
    <div>
      {line.raw.length === 0
        ? " "
        : line.segments.map((seg, j) => (
            <span key={j} className={ROLE_CLASS[seg.role]}>
              {seg.text}
            </span>
          ))}
      {line.error && (
        <span className="text-destructive"> {"←"} {line.error}</span>
      )}
    </div>
  )
}

function FoldedRun({
  lines,
  expanded,
  onToggle,
}: {
  lines: ParsedLine[]
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className="block w-full cursor-pointer select-none text-left italic text-muted-foreground/70 hover:text-foreground"
      >
        {expanded
          ? "⋯ hide skipped"
          : `⋯ ${lines.length} skipped line${lines.length === 1 ? "" : "s"}`}
      </button>
      {expanded && lines.map((line, j) => <LineRow key={j} line={line} />)}
    </>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-muted-foreground">
      <Swatch className="bg-emerald-500" label="used" />
      <Swatch className="bg-muted-foreground/60" label="skipped" />
      <Swatch className="bg-destructive" label="error" />
    </div>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${className}`} />
      {label}
    </span>
  )
}

function Summary({ result }: { result: ParseResult }) {
  if (result.commandError) {
    return (
      <span className="flex items-center gap-1.5 font-medium text-destructive">
        <TriangleAlertIcon className="size-3.5" />
        {result.commandError}
      </span>
    )
  }
  if (result.errorCount > 0) {
    return (
      <span className="flex items-center gap-1.5 font-medium text-destructive">
        <TriangleAlertIcon className="size-3.5" />
        {result.errorCount} line{result.errorCount === 1 ? "" : "s"} with errors —
        fix or remove to parse.
      </span>
    )
  }
  const noun = result.command === "ip-route" ? "route" : "interface"
  const label = `${noun}${result.usedCount === 1 ? "" : "s"}`
  return (
    <span className="text-muted-foreground">
      Will set {result.usedCount} {label}
      {result.skippedCount > 0 && ` · ${result.skippedCount} skipped`}
    </span>
  )
}
