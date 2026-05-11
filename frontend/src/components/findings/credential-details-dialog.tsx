import { type FormEvent, useState } from "react"
import {
  CheckCircle2Icon,
  KeyIcon,
  PencilIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { useAuthStore } from "@/stores/auth"
import { useCredentialStore } from "@/stores/credentials"
import {
  useCredential,
  useAddCredentialComment,
  useUpdateCredentialComment,
  useDeleteCredentialComment,
} from "@/graphql/hooks/credentials"
import { credentialTypeLabel } from "@/components/findings/credential-type-utils"
import type { CredentialCommentFieldsFragment } from "@/graphql/gql/graphql"

export function CredentialDetailsDialog() {
  const { detailsPanelOpen, selected, closeDialogs, openEditDialog } =
    useCredentialStore()
  const { data, isLoading } = useCredential(selected?.id ?? "")
  const credential = data?.credential

  return (
    <Dialog
      open={detailsPanelOpen}
      onOpenChange={(open) => {
        if (!open) closeDialogs()
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyIcon className="size-4" />
            {selected?.name ?? "Credential"}
          </DialogTitle>
          <DialogDescription>
            Credential details, tags, and comments.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !credential ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {credentialTypeLabel(credential.type)}
                </Badge>
                {credential.isValid ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2Icon className="size-3" />
                    Valid
                  </Badge>
                ) : (
                  <Badge variant="ghost" className="gap-1">
                    <XCircleIcon className="size-3" />
                    Invalid
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  onClick={() =>
                    openEditDialog({ id: credential.id, name: credential.name })
                  }
                >
                  <PencilIcon className="size-3.5" />
                  Edit
                </Button>
              </div>

              <FieldRow label="Username" value={credential.username || "—"} />
              <FieldRow label="Password" value={credential.password || "—"} mono />

              {credential.keys.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Keys
                  </div>
                  <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
                    {credential.keys.join("\n")}
                  </pre>
                </div>
              )}

              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Tags
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {credential.tags.length === 0 ? (
                    <span className="text-sm text-muted-foreground">—</span>
                  ) : (
                    credential.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        {t}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Created by {credential.createdBy?.username ?? "Unknown"} on{" "}
                <FormattedDateTimeText date={credential.createdAt} />
              </div>
            </section>

            <CommentsSection
              credentialId={credential.id}
              comments={credential.comments}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-2">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono break-all" : "break-words"}>{value}</div>
    </div>
  )
}

interface CommentsSectionProps {
  credentialId: string
  comments: readonly CredentialCommentFieldsFragment[]
}

function CommentsSection({ credentialId, comments }: CommentsSectionProps) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const addComment = useAddCredentialComment()
  const currentUserId = useAuthStore((s) => s.user?.userId)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!text.trim()) return
    setError(null)
    try {
      await addComment.mutateAsync({ credentialId, text })
      setText("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment")
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Comments ({comments.length})</h3>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              credentialId={credentialId}
              comment={c}
              isOwn={c.author?.id === currentUserId}
            />
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        {error && (
          <div className="rounded-md bg-destructive/15 p-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <Textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
        />
        <div className="self-end">
          <Button
            type="submit"
            size="sm"
            disabled={addComment.isPending || !text.trim()}
          >
            {addComment.isPending ? "Posting..." : "Post comment"}
          </Button>
        </div>
      </form>
    </section>
  )
}

interface CommentRowProps {
  credentialId: string
  comment: CredentialCommentFieldsFragment
  isOwn: boolean
}

function CommentRow({ credentialId, comment, isOwn }: CommentRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.text)
  const [error, setError] = useState<string | null>(null)
  const updateComment = useUpdateCredentialComment()
  const deleteComment = useDeleteCredentialComment()

  async function handleSave() {
    setError(null)
    try {
      await updateComment.mutateAsync({
        credentialId,
        commentId: comment.id,
        text: draft,
      })
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update comment")
    }
  }

  async function handleDelete() {
    setError(null)
    try {
      await deleteComment.mutateAsync({ credentialId, commentId: comment.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete comment")
    }
  }

  return (
    <li className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {comment.author?.username ?? "Deleted user"}
        </span>
        <span>·</span>
        <FormattedDateTimeText date={comment.createdAt} />
        {comment.updatedAt !== comment.createdAt && (
          <>
            <span>·</span>
            <span>edited</span>
          </>
        )}
        {isOwn && !editing && (
          <div className="ms-auto flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setDraft(comment.text)
                setEditing(true)
              }}
              aria-label="Edit comment"
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleDelete}
              disabled={deleteComment.isPending}
              aria-label="Delete comment"
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {error && (
        <div className="mb-1 rounded-md bg-destructive/15 p-1.5 text-xs text-destructive">
          {error}
        </div>
      )}
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={updateComment.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={
                updateComment.isPending ||
                !draft.trim() ||
                draft === comment.text
              }
            >
              {updateComment.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words">{comment.text}</p>
      )}
    </li>
  )
}
