import { useMemo, useState } from "react"
import { LoaderIcon, UserPlusIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SuggestionInput } from "@/components/ui/suggestion-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/auth"
import { useOperationStore } from "@/stores/operations"
import { Permissions } from "@/constants/permissions"
import {
  useOperation,
  useUserSuggestions,
  useAddOperationMember,
  useRemoveOperationMember,
  useUpdateOperationMemberRole,
} from "@/graphql/hooks/operations"
import type { OperationRole } from "@/graphql/gql/graphql"

const ROLE_OPTIONS: { value: OperationRole; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "OPERATOR", label: "Operator" },
  { value: "VIEWER", label: "Viewer" },
]

function roleBadgeVariant(role: OperationRole) {
  switch (role) {
    case "ADMIN":
      return "default" as const
    case "OPERATOR":
      return "secondary" as const
    default:
      return "outline" as const
  }
}

export function MembersDialog() {
  const { membersDialogOpen, selectedOperation, closeDialogs } = useOperationStore()
  const { data, isLoading } = useOperation(selectedOperation?.id ?? "")
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const currentUserId = useAuthStore((s) => s.user?.userId)

  const addMember = useAddOperationMember()
  const removeMember = useRemoveOperationMember()
  const updateRole = useUpdateOperationMemberRole()

  // Add member form state
  const [userSearch, setUserSearch] = useState("")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<OperationRole>("VIEWER")
  const [error, setError] = useState<string | null>(null)

  const operation = data?.operation
  const members = operation?.members ?? []

  // Current user is operation admin or app admin
  const isAppAdmin = hasPermission(Permissions.OPERATION_DELETE)
  const isOpAdmin = members.some(
    (m) => m.user.id === currentUserId && m.role === "ADMIN"
  )
  const canManage = isAppAdmin || isOpAdmin

  // User search for add-member picker — uses lightweight userSuggestions query
  // which only requires operation:member permission (not user:read).
  const { data: suggestionsData } = useUserSuggestions(userSearch)

  // Exclude current members from suggestions
  const memberUserIds = useMemo(
    () => new Set(members.map((m) => m.user.id)),
    [members],
  )
  const availableUsers = useMemo(
    () =>
      (suggestionsData?.userSuggestions ?? []).filter(
        (u) => !memberUserIds.has(u.id),
      ),
    [suggestionsData, memberUserIds],
  )

  async function handleAddMember() {
    if (!selectedOperation || !selectedUserId) return
    setError(null)

    try {
      await addMember.mutateAsync({
        operationId: selectedOperation.id,
        userId: selectedUserId,
        role: selectedRole,
      })
      // Reset add form
      setSelectedUserId(null)
      setSelectedUsername(null)
      setUserSearch("")
      setSelectedRole("VIEWER")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member")
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedOperation) return
    setError(null)

    try {
      await removeMember.mutateAsync({
        operationId: selectedOperation.id,
        userId,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member")
    }
  }

  async function handleRoleChange(userId: string, role: OperationRole) {
    if (!selectedOperation) return
    setError(null)

    try {
      await updateRole.mutateAsync({
        operationId: selectedOperation.id,
        userId,
        role,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role")
    }
  }

  function handleClose() {
    closeDialogs()
    setError(null)
    setUserSearch("")
    setSelectedUserId(null)
    setSelectedUsername(null)
    setSelectedRole("VIEWER")
  }

  return (
    <Dialog
      open={membersDialogOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
        else setError(null)
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
          <DialogDescription>
            Manage members of{" "}
            <span className="font-medium text-foreground">
              {selectedOperation?.name}
            </span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Add member section */}
            {canManage && (
              <div className="space-y-2 border-b pb-4">
                <div className="text-sm font-medium">Add member</div>
                <div className="flex gap-2">
                  <SuggestionInput
                    className="flex-1"
                    search={userSearch}
                    onSearchChange={setUserSearch}
                    selected={
                      selectedUserId
                        ? { value: selectedUserId, label: selectedUsername ?? "" }
                        : null
                    }
                    onSelect={(opt) => {
                      if (opt) {
                        setSelectedUserId(opt.value)
                        setSelectedUsername(opt.label)
                      } else {
                        setSelectedUserId(null)
                        setSelectedUsername(null)
                      }
                    }}
                    options={availableUsers.map((u) => ({
                      value: u.id,
                      label: u.username,
                    }))}
                    placeholder="Search users..."
                    emptyMessage="No users found"
                  />
                  <Select
                    value={selectedRole}
                    onValueChange={(val) => setSelectedRole(val as OperationRole)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    onClick={handleAddMember}
                    disabled={!selectedUserId || addMember.isPending}
                  >
                    {addMember.isPending ? (
                      <LoaderIcon className="size-4 animate-spin" />
                    ) : (
                      <UserPlusIcon className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Current members list */}
            <div className="space-y-1">
              <div className="text-sm font-medium">
                Current members ({members.length})
              </div>
              {members.length === 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  No members
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {members.map((member) => (
                    <div
                      key={member.user.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                    >
                      <span className="flex-1 text-sm font-medium truncate">
                        {member.user.username}
                      </span>

                      {canManage ? (
                        <Select
                          value={member.role}
                          onValueChange={(val) =>
                            handleRoleChange(member.user.id, val as OperationRole)
                          }
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={roleBadgeVariant(member.role)}>
                          {member.role}
                        </Badge>
                      )}

                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveMember(member.user.id)}
                          disabled={removeMember.isPending}
                        >
                          <XIcon className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
