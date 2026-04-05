import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/ui/search-input"
import { useAuthStore } from "@/stores/auth"
import { useOperationStore } from "@/stores/operations"
import { Permissions } from "@/constants/permissions"

export function OperationsToolbar() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const { search, setSearch, openCreateDialog } = useOperationStore()

  return (
    <div className="flex items-center justify-between gap-3">
      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search operations..."
      />
      {hasPermission(Permissions.OPERATION_CREATE) && (
        <Button onClick={openCreateDialog}>
          <PlusIcon className="size-4" />
          Create Operation
        </Button>
      )}
    </div>
  )
}
