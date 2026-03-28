import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TableSearchInput } from "@/components/ui/table-search-input"
import { useAuthStore } from "@/stores/auth"
import { useUserStore } from "@/stores/users"
import { Permissions } from "@/constants/permissions"

export function UsersToolbar() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const { search, setSearch, openCreateDialog } = useUserStore()

  return (
    <div className="flex items-center justify-between gap-3">
      <TableSearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search users..."
      />
      {hasPermission(Permissions.USER_CREATE) && (
        <Button onClick={openCreateDialog}>
          <PlusIcon className="size-4" />
          Create User
        </Button>
      )}
    </div>
  )
}
