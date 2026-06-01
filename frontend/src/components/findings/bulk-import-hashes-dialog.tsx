import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useHashStore } from "@/stores/hashes"
import { useBulkImportHashes, useHashTypes } from "@/graphql/hooks/hashes"
import type { BulkHashFormat } from "@/graphql/gql/graphql"
import { parseTags } from "@/components/findings/parse-tags"

interface BulkImportDialogProps {
  operationId: string
}

const FORMAT_OPTIONS: { value: BulkHashFormat; label: string; help: string }[] =
  [
    {
      value: "RAW",
      label: "Raw (one hash per line)",
      help: "Each non-empty line becomes a hash of the default type below.",
    },
    {
      value: "SECRETSDUMP",
      label: "Impacket secretsdump",
      help: "user:rid:lmhash:nthash::: — NT hashes only, LM dropped.",
    },
    {
      value: "PWDUMP",
      label: "pwdump format",
      help: "Same field layout as secretsdump. NT hashes only.",
    },
  ]

export function BulkImportHashesDialog({ operationId }: BulkImportDialogProps) {
  const { bulkImportDialogOpen, closeBulkImportDialog } = useHashStore()
  const bulkImport = useBulkImportHashes()
  const types = useHashTypes()

  const [text, setText] = useState("")
  const [format, setFormat] = useState<BulkHashFormat>("SECRETSDUMP")
  const [defaultType, setDefaultType] = useState("NTLM")
  const [source, setSource] = useState("")
  const [tagsRaw, setTagsRaw] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(
    null,
  )

  function reset() {
    setText("")
    setFormat("SECRETSDUMP")
    setDefaultType("NTLM")
    setSource("")
    setTagsRaw("")
    setError(null)
    setResult(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setResult(null)
    const trimmed = text.trim()
    if (!trimmed) {
      setError("Paste at least one hash.")
      return
    }
    try {
      const data = await bulkImport.mutateAsync({
        operationId,
        input: {
          text: trimmed,
          format,
          // Only meaningful for RAW; backend ignores it for the structured formats.
          defaultHashType: format === "RAW" ? defaultType : null,
          source: source.trim() || null,
          tags: parseTags(tagsRaw),
        },
      })
      setResult({
        added: data.bulkImportHashes.added,
        skipped: data.bulkImportHashes.skipped,
      })
      // Keep dialog open so the user sees the summary; "Done" closes it.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk import failed")
    }
  }

  const formatHelp = FORMAT_OPTIONS.find((o) => o.value === format)?.help

  return (
    <Dialog
      open={bulkImportDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          closeBulkImportDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk import hashes</DialogTitle>
          <DialogDescription>
            Paste many hashes at once. Duplicates within the operation are
            silently skipped.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
              Imported <strong>{result.added}</strong> · skipped{" "}
              <strong>{result.skipped}</strong> duplicate
              {result.skipped === 1 ? "" : "s"}.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Format</Label>
              <Select
                value={format}
                onValueChange={(v) => setFormat(v as BulkHashFormat)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMAT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formatHelp && (
                <p className="text-xs text-muted-foreground">{formatHelp}</p>
              )}
            </div>
            {format === "RAW" && (
              <div className="grid gap-1.5">
                <Label>Default hash type</Label>
                <Select value={defaultType} onValueChange={setDefaultType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.data?.hashTypes.map((t) => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.displayName}
                      </SelectItem>
                    )) ?? null}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-hash-text">Paste</Label>
            <Textarea
              id="bulk-hash-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              className="font-mono text-xs"
              placeholder={
                format === "RAW"
                  ? "31d6cfe0d16ae931b73c59d7e0c089c0\n8846f7eaee8fb117ad06bdd830b7586c"
                  : "Administrator:500:aad3b435...:31d6cfe0...:::"
              }
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-hash-source">Source</Label>
              <Input
                id="bulk-hash-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="secretsdump on DC01"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-hash-tags">Tags (comma-separated)</Label>
              <Input
                id="bulk-hash-tags"
                value={tagsRaw}
                onChange={(e) => setTagsRaw(e.target.value)}
                placeholder="dc01, ntlm"
              />
            </div>
          </div>
          <DialogFooter>
            {result ? (
              <Button
                type="button"
                onClick={() => {
                  reset()
                  closeBulkImportDialog()
                }}
              >
                Done
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={bulkImport.isPending || !text.trim()}
              >
                {bulkImport.isPending ? "Importing..." : "Import"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

