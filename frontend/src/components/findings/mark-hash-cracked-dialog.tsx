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
import { Label } from "@/components/ui/label"
import { useHashStore } from "@/stores/hashes"
import { useHash, useMarkHashCracked } from "@/graphql/hooks/hashes"

type Mode = "new" | "existing"

interface MarkValues {
  plaintext: string
  mode: Mode
  // Existing-credential picker — for v1 we accept a free-form UUID so the
  // operator can paste a credential id from elsewhere. A proper picker can
  // replace this without changing the mutation shape.
  credentialId: string
  // New-credential fields
  credentialName: string
  // Optional postmortem
  tool: string
  wordlist: string
  rules: string
  durationSec: string
}

const emptyValues: MarkValues = {
  plaintext: "",
  mode: "new",
  credentialId: "",
  credentialName: "",
  tool: "",
  wordlist: "",
  rules: "",
  durationSec: "",
}

export function MarkHashCrackedDialog() {
  const { markCrackedDialogOpen, closeMarkCrackedDialog, selected } =
    useHashStore()
  const mark = useMarkHashCracked()
  const hashQuery = useHash(selected?.id ?? "", { enabled: !!selected?.id })
  const hash = hashQuery.data?.hash

  const [values, setValues] = useState<MarkValues>(emptyValues)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setValues(emptyValues)
    setError(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selected) return
    setError(null)

    const plaintext = values.plaintext.trim()
    if (!plaintext) {
      setError("Plaintext is required.")
      return
    }

    const dur = values.durationSec.trim()
      ? Number.parseInt(values.durationSec, 10)
      : null
    if (dur !== null && (Number.isNaN(dur) || dur < 0)) {
      setError("Duration must be a non-negative integer (seconds).")
      return
    }

    try {
      await mark.mutateAsync({
        id: selected.id,
        input: {
          plaintext,
          credentialId:
            values.mode === "existing" ? values.credentialId.trim() : null,
          newCredential:
            values.mode === "new"
              ? {
                  name: values.credentialName.trim() || "",
                  type: "PASSWORD",
                  // Username/password defaults are filled server-side from
                  // the hash + plaintext.
                  username: hash?.username || null,
                }
              : null,
          tool: values.tool.trim() || null,
          wordlist: values.wordlist.trim() || null,
          rules: values.rules.trim() || null,
          durationSec: dur,
        },
      })
      reset()
      closeMarkCrackedDialog()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark cracked")
    }
  }

  return (
    <Dialog
      open={markCrackedDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset()
          closeMarkCrackedDialog()
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Mark hash as cracked</DialogTitle>
          <DialogDescription>
            Record the plaintext and link it to a credential. A new credential
            is created in this operation by default.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="cracked-plaintext">Plaintext password</Label>
            <Input
              id="cracked-plaintext"
              value={values.plaintext}
              onChange={(e) =>
                setValues((v) => ({ ...v, plaintext: e.target.value }))
              }
              className="font-mono"
              required
            />
          </div>

          <div className="flex gap-3 rounded-md border p-2">
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="cred-mode"
                checked={values.mode === "new"}
                onChange={() =>
                  setValues((v) => ({ ...v, mode: "new" }))
                }
              />
              Create new credential
            </label>
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="cred-mode"
                checked={values.mode === "existing"}
                onChange={() =>
                  setValues((v) => ({ ...v, mode: "existing" }))
                }
              />
              Use existing credential
            </label>
          </div>

          {values.mode === "new" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="cracked-cred-name">
                Credential name (optional)
              </Label>
              <Input
                id="cracked-cred-name"
                value={values.credentialName}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    credentialName: e.target.value,
                  }))
                }
                placeholder={
                  hash?.username
                    ? `${hash.username} (cracked from ${hash.hashType})`
                    : `Cracked from ${hash?.hashType ?? "hash"}`
                }
              />
              <p className="text-xs text-muted-foreground">
                Defaults to "{hash?.username || "—"} (cracked from{" "}
                {hash?.hashType || "hash"})" if left blank.
              </p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="cracked-cred-id">Credential ID</Label>
              <Input
                id="cracked-cred-id"
                value={values.credentialId}
                onChange={(e) =>
                  setValues((v) => ({ ...v, credentialId: e.target.value }))
                }
                placeholder="UUID of a credential in this operation"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                The plaintext above will be set as that credential's password.
              </p>
            </div>
          )}

          <details className="rounded-md border p-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Optional postmortem (tool, wordlist, rules, duration)
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="cracked-tool">Tool</Label>
                <Input
                  id="cracked-tool"
                  value={values.tool}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, tool: e.target.value }))
                  }
                  placeholder="hashcat"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cracked-wordlist">Wordlist</Label>
                <Input
                  id="cracked-wordlist"
                  value={values.wordlist}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, wordlist: e.target.value }))
                  }
                  placeholder="rockyou.txt"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cracked-rules">Rules</Label>
                <Input
                  id="cracked-rules"
                  value={values.rules}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, rules: e.target.value }))
                  }
                  placeholder="OneRuleToRuleThemAll"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cracked-duration">Duration (seconds)</Label>
                <Input
                  id="cracked-duration"
                  value={values.durationSec}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      durationSec: e.target.value,
                    }))
                  }
                  type="number"
                  min={0}
                />
              </div>
            </div>
          </details>

          <DialogFooter>
            <Button type="submit" disabled={mark.isPending}>
              {mark.isPending ? "Saving..." : "Mark as cracked"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
