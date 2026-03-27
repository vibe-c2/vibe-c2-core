import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useUserStore } from "@/stores/users"
import { useUser, useUpdateUser } from "@/graphql/hooks/users"
import type { UpdateUserInput } from "@/graphql/gql/graphql"

export function EditUserDialog() {
  const { editDialogOpen, selectedUser, closeDialogs } = useUserStore()
  const { data, isLoading } = useUser(selectedUser?.id ?? "")
  const updateUser = useUpdateUser()
  const [error, setError] = useState<string | null>(null)

  const user = data?.user

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!selectedUser) return
    setError(null)

    const form = new FormData(e.currentTarget)
    const username = form.get("username") as string
    const password = form.get("password") as string
    const active = form.get("active") === "on"

    // Collect checked roles
    const roles: string[] = []
    if (form.get("role-admin")) roles.push("admin")
    if (form.get("role-user")) roles.push("user")

    if (roles.length === 0) {
      setError("At least one role must be selected")
      return
    }

    const input: UpdateUserInput = { username, roles, active }
    // Only include password if the user typed a new one
    if (password) input.password = password

    try {
      await updateUser.mutateAsync({ id: selectedUser.id, input })
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user")
    }
  }

  return (
    <Dialog
      open={editDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user details. Leave password blank to keep it unchanged.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !user ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : (
          <form onSubmit={handleSubmit} key={user.id}>
            <FieldGroup>
              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              <Field>
                <FieldLabel htmlFor="edit-username">Username</FieldLabel>
                <Input
                  id="edit-username"
                  name="username"
                  type="text"
                  required
                  defaultValue={user.username}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-password">
                  Password
                </FieldLabel>
                <Input
                  id="edit-password"
                  name="password"
                  type="password"
                  placeholder="Leave blank to keep unchanged"
                />
              </Field>
              <Field>
                <FieldLabel>Roles</FieldLabel>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="role-admin"
                      defaultChecked={user.roles.includes("admin")}
                    />
                    Admin
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="role-user"
                      defaultChecked={user.roles.includes("user")}
                    />
                    User
                  </label>
                </div>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="edit-active">Active</FieldLabel>
                <Switch
                  id="edit-active"
                  name="active"
                  defaultChecked={user.active}
                />
              </Field>
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button
                type="submit"
                disabled={updateUser.isPending}
              >
                {updateUser.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
