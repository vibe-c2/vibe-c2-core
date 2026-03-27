import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useUserStore } from "@/stores/users"
import { useDeleteUser } from "@/graphql/hooks/users"

export function DeleteUserDialog() {
  const { deleteDialogOpen, selectedUser, closeDialogs } = useUserStore()
  const deleteUser = useDeleteUser()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!selectedUser) return
    setError(null)

    try {
      await deleteUser.mutateAsync(selectedUser.id)
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user")
    }
  }

  return (
    <Dialog
      open={deleteDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete User</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-medium text-foreground">
              {selectedUser?.username}
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={closeDialogs}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteUser.isPending}
          >
            {deleteUser.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
