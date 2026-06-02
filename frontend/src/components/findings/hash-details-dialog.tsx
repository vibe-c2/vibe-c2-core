import { useEffect, useRef, useState } from "react"
import { KeyIcon, Trash2Icon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { WikiCredentialChipById } from "@/components/wiki/wiki-credential-chip-view"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { TagComboboxInput } from "@/components/findings/tag-combobox-input"
import { useHashStore } from "@/stores/hashes"
import { useHash, useHashTags, useUpdateHash } from "@/graphql/hooks/hashes"
import type { HashStatus, UpdateHashInput } from "@/graphql/gql/graphql"
import {
  HASH_STATUSES,
  hashStatusBadgeClass,
  hashStatusLabel,
  truncateHashValue,
} from "@/components/findings/hash-status-utils"

// hashLabel is the short title shown in dialogs/buttons.
const hashLabel = truncateHashValue

// Status options operators can pick here: every status EXCEPT CRACKED. The
// server rejects an UpdateHash that moves into CRACKED — that goes through the
// dedicated "Mark as cracked" flow so a credential is always linked.
const EDITABLE_STATUSES = HASH_STATUSES.filter((s) => s !== "CRACKED")

// Max auto-grow height for the comment box before it starts scrolling (~28
// rows). Beyond this the action row would get pushed off-screen.
const COMMENT_MAX_PX = 640

// Unified view + edit card for a single hash. There is no save button: free
// text fields (value, comment) commit on blur; status and tags commit on
// change. Each commit is a partial UpdateHash mutation.
export function HashDetailsDialog() {
  const {
    detailsPanelOpen,
    closeDetailsPanel,
    selected,
    openDeleteDialog,
    openMarkCrackedDialog,
  } = useHashStore()
  const hashQuery = useHash(selected?.id ?? "", { enabled: !!selected?.id })
  const hash = hashQuery.data?.hash
  const updateHash = useUpdateHash()
  const tagsQuery = useHashTags(hash?.operationId ?? "")
  const tagSuggestions = tagsQuery.data?.hashTags ?? []

  // Local drafts for the free-text fields. Seeded from the server hash and
  // committed on blur — keeping a draft lets the operator type freely without
  // a mutation firing on every keystroke. Status/tags don't need a draft
  // because they commit on a discrete change.
  const [valueDraft, setValueDraft] = useState("")
  const [commentDraft, setCommentDraft] = useState("")

  // The comment box grows to fit its content (capped at COMMENT_MAX_PX, then
  // scrolls). We drive this in JS rather than CSS field-sizing because Firefox
  // doesn't support field-sizing yet.
  const commentRef = useRef<HTMLTextAreaElement>(null)

  // Reseed drafts only when the underlying hash identity changes (dialog
  // opened on a different row). We intentionally do NOT reseed on every
  // hash.value change so an in-flight save echoing back through the cache
  // can't clobber what the operator is mid-typing.
  useEffect(() => {
    if (hash) {
      setValueDraft(hash.value)
      setCommentDraft(hash.comment)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash?.id])

  // Resize the comment box to fit its content whenever the text changes or the
  // dialog (re)opens. "auto" first so it can shrink as well as grow.
  useEffect(() => {
    const el = commentRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, COMMENT_MAX_PX)}px`
  }, [commentDraft, detailsPanelOpen, hash?.id])

  if (!selected) return null

  async function save(input: UpdateHashInput, fallbackError: string) {
    if (!hash) return
    try {
      await updateHash.mutateAsync({ id: hash.id, input })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : fallbackError)
    }
  }

  function commitValue() {
    if (!hash) return
    const trimmed = valueDraft.trim()
    // Value can't be blanked — revert the draft to the last good value.
    if (!trimmed) {
      setValueDraft(hash.value)
      return
    }
    if (trimmed === hash.value) return
    void save({ value: trimmed }, "Failed to update hash value")
  }

  function commitComment() {
    if (!hash || commentDraft === hash.comment) return
    void save({ comment: commentDraft }, "Failed to update comment")
  }

  function changeStatus(next: HashStatus) {
    if (!hash || next === hash.status) return
    void save({ status: next }, "Failed to update status")
  }

  function changeTags(next: string[]) {
    if (!hash) return
    const unchanged =
      next.length === hash.tags.length &&
      next.every((t, i) => t === hash.tags[i])
    if (unchanged) return
    void save({ tags: next }, "Failed to update tags")
  }

  return (
    <Dialog
      open={detailsPanelOpen}
      onOpenChange={(open) => {
        if (!open) closeDetailsPanel()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono text-sm">
              {hash ? hashLabel(hash.value) : selected.label}
            </span>
            {hash && (
              <Badge
                variant="outline"
                className={hashStatusBadgeClass(hash.status)}
              >
                {hashStatusLabel(hash.status)}
              </Badge>
            )}
            {updateHash.isPending && (
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            )}
          </DialogTitle>
        </DialogHeader>

        {hashQuery.isLoading || !hash ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ) : (
          // min-w-0 — the parent DialogContent is `display: grid`. Without it
          // the default `min-width: auto` lets long unbroken values blow out
          // the dialog instead of wrapping.
          <div className="min-w-0 space-y-4">
            <Field label="Value" htmlFor="hash-value">
              <Textarea
                id="hash-value"
                value={valueDraft}
                onChange={(e) => setValueDraft(e.target.value)}
                onBlur={commitValue}
                rows={3}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </Field>

            <Field label="Status">
              <Select
                value={hash.status}
                onValueChange={(v) => changeStatus(v as HashStatus)}
                disabled={hash.status === "CRACKED"}
              >
                <SelectTrigger>
                  <SelectValue>
                    {(v: string) => hashStatusLabel(v as HashStatus) ?? v}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {hashStatusLabel(s)}
                    </SelectItem>
                  ))}
                  {/* Keep the select controlled when already cracked. CRACKED
                      can only be reached via "Mark as cracked", so it's shown
                      disabled here. */}
                  {hash.status === "CRACKED" && (
                    <SelectItem value="CRACKED" disabled>
                      {hashStatusLabel("CRACKED")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {hash.status === "CRACKED" && (
                <p className="text-xs text-muted-foreground">
                  Cracked hashes keep their status — it carries the linked
                  credential.
                </p>
              )}
            </Field>

            <Field label="Comment" htmlFor="hash-comment">
              {/* Height is driven by the autosize effect above (see
                  commentRef); resize-none disables the manual grip since the
                  box already tracks its content. */}
              <Textarea
                ref={commentRef}
                id="hash-comment"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onBlur={commitComment}
                rows={3}
                placeholder="Add a comment…"
                className="min-h-24 resize-none overflow-auto"
              />
            </Field>

            <Field label="Tags" htmlFor="hash-tags-input">
              <TagComboboxInput
                value={hash.tags}
                onChange={changeTags}
                suggestions={tagSuggestions}
                loading={tagsQuery.isLoading}
                inputId="hash-tags-input"
              />
            </Field>

            {hash.credentialId && (
              <Field label="Linked credential">
                <div className="flex flex-wrap items-center gap-1.5">
                  <WikiCredentialChipById id={hash.credentialId} withContextMenu />
                </div>
              </Field>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              {hash.status !== "CRACKED" && (
                <Button
                  onClick={() =>
                    openMarkCrackedDialog({
                      id: hash.id,
                      label: hashLabel(hash.value),
                    })
                  }
                >
                  <KeyIcon className="size-4" />
                  Mark as cracked
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={() =>
                  openDeleteDialog({
                    id: hash.id,
                    label: hashLabel(hash.value),
                  })
                }
                className="text-destructive hover:text-destructive"
              >
                <Trash2Icon className="size-4" />
                Delete
              </Button>
              <div className="ms-auto text-xs text-muted-foreground">
                Added <FormattedDateTimeText date={hash.createdAt} /> by{" "}
                {hash.createdBy?.username ?? "—"}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      {htmlFor ? (
        <Label
          htmlFor={htmlFor}
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </Label>
      ) : (
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      {children}
    </div>
  )
}
