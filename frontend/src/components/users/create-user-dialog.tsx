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
import { useCreateUser } from "@/graphql/hooks/users"

export function CreateUserDialog() {
  const { createDialogOpen, closeDialogs } = useUserStore()
  const createUser = useCreateUser()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
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

    try {
      await createUser.mutateAsync({ username, password, roles, active })
      closeDialogs()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user")
    }
  }

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeDialogs()
          setError(null)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Add a new user to the system.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off">
          <FieldGroup>
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Field>
              <FieldLabel htmlFor="create-username">Username</FieldLabel>
              <Input
                id="create-username"
                name="username"
                type="text"
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="create-password">Password</FieldLabel>
              <Input
                id="create-password"
                name="password"
                type="password"
                required
              />
            </Field>
            <Field>
              <FieldLabel>Roles</FieldLabel>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="role-admin" />
                  Admin
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="role-user" defaultChecked />
                  User
                </label>
              </div>
            </Field>
            <Field orientation="horizontal">
              <FieldLabel htmlFor="create-active">Active</FieldLabel>
              <Switch id="create-active" name="active" defaultChecked />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              type="submit"
              disabled={createUser.isPending}
            >
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
