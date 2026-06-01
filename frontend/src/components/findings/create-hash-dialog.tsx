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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useHashStore } from "@/stores/hashes"
import { useCreateHash, useHashTypes } from "@/graphql/hooks/hashes"
import {
  OperationSinglePicker,
  type OperationSinglePickerValue,
} from "@/components/findings/operation-single-select"
import { parseTags } from "@/components/findings/parse-tags"

interface CreateHashDialogProps {
  // Scoped mode: parent fixes the target operation. Global mode: omit so the
  // dialog renders an op picker (same pattern as CreateCredentialDialog).
  operationId?: string
}

interface HashFormValues {
  value: string
  hashType: string
  username: string
  domain: string
  source: string
  tags: string
}

const emptyValues: HashFormValues = {
  value: "",
  hashType: "NTLM",
  username: "",
  domain: "",
  source: "",
  tags: "",
}

export function CreateHashDialog({ operationId }: CreateHashDialogProps) {
  const { createDialogOpen, closeCreateDialog } = useHashStore()
  const createHash = useCreateHash()
  const types = useHashTypes()
  const [values, setValues] = useState<HashFormValues>(emptyValues)
  const [error, setError] = useState<string | null>(null)
  const [pickedOp, setPickedOp] =
    useState<OperationSinglePickerValue | null>(null)

  const isGlobalMode = operationId === undefined
  const targetOpId = operationId ?? pickedOp?.id ?? null

  function reset() {
    setValues(emptyValues)
    setError(null)
    setPickedOp(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!targetOpId) {
      setError("Pick an operation to add this hash to.")
      return
    }
    try {
      await createHash.mutateAsync({
        operationId: targetOpId,
        input: {
          value: values.value.trim(),
          hashType: values.hashType,
          username: values.username.trim() || null,
          domain: values.domain.trim() || null,
          source: values.source.trim() || null,
          tags: parseTags(values.tags),
        },
      })
      reset()
      closeCreateDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create hash")
    }
  }

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          closeCreateDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add hash</DialogTitle>
          <DialogDescription>
            Record a single password hash. Use bulk import for many at once.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {isGlobalMode && (
            <div className="grid gap-1.5">
              <Label>Operation</Label>
              <OperationSinglePicker
                value={pickedOp}
                onChange={setPickedOp}
                placeholder="Pick the operation to add this hash to"
                className="w-full"
              />
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="hash-value">Hash value</Label>
            <Textarea
              id="hash-value"
              value={values.value}
              onChange={(e) =>
                setValues((v) => ({ ...v, value: e.target.value }))
              }
              placeholder="aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0"
              rows={3}
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select
                value={values.hashType}
                onValueChange={(v) =>
                  setValues((cur) => ({ ...cur, hashType: v ?? "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.data?.hashTypes.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.displayName}
                      {t.hashcatMode > 0 ? ` · -m ${t.hashcatMode}` : ""}
                    </SelectItem>
                  )) ?? null}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hash-source">Source</Label>
              <Input
                id="hash-source"
                value={values.source}
                onChange={(e) =>
                  setValues((v) => ({ ...v, source: e.target.value }))
                }
                placeholder="secretsdump on DC01"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hash-username">Username</Label>
              <Input
                id="hash-username"
                value={values.username}
                onChange={(e) =>
                  setValues((v) => ({ ...v, username: e.target.value }))
                }
                placeholder="alice"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="hash-domain">Domain</Label>
              <Input
                id="hash-domain"
                value={values.domain}
                onChange={(e) =>
                  setValues((v) => ({ ...v, domain: e.target.value }))
                }
                placeholder="CORP"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="hash-tags">Tags (comma-separated)</Label>
            <Input
              id="hash-tags"
              value={values.tags}
              onChange={(e) =>
                setValues((v) => ({ ...v, tags: e.target.value }))
              }
              placeholder="dc01, kerberoast"
            />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={
                createHash.isPending || !values.value.trim() || !targetOpId
              }
            >
              {createHash.isPending ? "Saving..." : "Add hash"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

