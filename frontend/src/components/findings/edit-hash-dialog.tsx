import { type FormEvent, useEffect, useState } from "react"
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
import { useUpdateHash, useHash, useHashTypes } from "@/graphql/hooks/hashes"
import type { HashStatus } from "@/graphql/gql/graphql"
import {
  HASH_STATUSES,
  hashStatusLabel,
} from "@/components/findings/hash-status-utils"
import { parseTags } from "@/components/findings/parse-tags"

interface HashEditValues {
  value: string
  hashType: string
  username: string
  domain: string
  source: string
  status: HashStatus
  tags: string
}

// Status options in the edit dialog: every status EXCEPT CRACKED. The server
// rejects an UpdateHash that tries to move into CRACKED — the operator goes
// through "Mark as cracked" instead, which carries the credential link.
const EDITABLE_STATUSES = HASH_STATUSES.filter((s) => s !== "CRACKED")

export function EditHashDialog() {
  const { editDialogOpen, closeEditDialog, selected } = useHashStore()
  const updateHash = useUpdateHash()
  const types = useHashTypes()
  const hashQuery = useHash(selected?.id ?? "", { enabled: !!selected?.id })
  const hash = hashQuery.data?.hash

  const [values, setValues] = useState<HashEditValues | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Reset the form when the dialog opens with a different hash or new data
  // arrives. The hash detail query is the source of truth — we don't trust
  // anything passed via the store (which only carries id + label).
  useEffect(() => {
    if (!editDialogOpen) {
      setValues(null)
      setError(null)
      return
    }
    if (hash) {
      setValues({
        value: hash.value,
        hashType: hash.hashType,
        username: hash.username,
        domain: hash.domain,
        source: hash.source,
        status: hash.status,
        tags: hash.tags.join(", "),
      })
    }
  }, [editDialogOpen, hash])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selected || !values) return
    setError(null)
    try {
      await updateHash.mutateAsync({
        id: selected.id,
        input: {
          value: values.value.trim(),
          hashType: values.hashType,
          username: values.username,
          domain: values.domain,
          source: values.source,
          status: values.status,
          tags: parseTags(values.tags),
        },
      })
      closeEditDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update hash")
    }
  }

  return (
    <Dialog
      open={editDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeEditDialog()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit hash</DialogTitle>
          <DialogDescription>
            Updating to "Cracked" goes through the dedicated "Mark as cracked"
            flow so a credential is always linked.
          </DialogDescription>
        </DialogHeader>
        {!values ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            autoComplete="off"
            className="space-y-3"
          >
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="edit-hash-value">Hash value</Label>
              <Textarea
                id="edit-hash-value"
                value={values.value}
                onChange={(e) =>
                  setValues((v) => v && { ...v, value: e.target.value })
                }
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
                    setValues((cur) => cur && { ...cur, hashType: v ?? "" })
                  }
                >
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
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select
                  value={values.status}
                  onValueChange={(v) =>
                    setValues(
                      (cur) => cur && { ...cur, status: v as HashStatus },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EDITABLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {hashStatusLabel(s)}
                      </SelectItem>
                    ))}
                    {/* Show CRACKED disabled if the hash is already cracked
                        so the select stays controlled. */}
                    {hash?.status === "CRACKED" && (
                      <SelectItem value="CRACKED" disabled>
                        {hashStatusLabel("CRACKED")}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-hash-username">Username</Label>
                <Input
                  id="edit-hash-username"
                  value={values.username}
                  onChange={(e) =>
                    setValues((v) => v && { ...v, username: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-hash-domain">Domain</Label>
                <Input
                  id="edit-hash-domain"
                  value={values.domain}
                  onChange={(e) =>
                    setValues((v) => v && { ...v, domain: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="edit-hash-source">Source</Label>
                <Input
                  id="edit-hash-source"
                  value={values.source}
                  onChange={(e) =>
                    setValues((v) => v && { ...v, source: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="edit-hash-tags">Tags (comma-separated)</Label>
                <Input
                  id="edit-hash-tags"
                  value={values.tags}
                  onChange={(e) =>
                    setValues((v) => v && { ...v, tags: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateHash.isPending}>
                {updateHash.isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

