import { useEffect, useState } from "react"
import { PlusIcon, SearchIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthStore } from "@/stores/auth"
import { useUserStore } from "@/stores/users"
import { Permissions } from "@/constants/permissions"

export function UsersToolbar() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const { search, setSearch, openCreateDialog } = useUserStore()

  // Debounce search input — local state syncs to store after 300ms
  const [inputValue, setInputValue] = useState(search)

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(inputValue), 300)
    return () => clearTimeout(timeout)
  }, [inputValue, setSearch])

  // Keep local input in sync if store search is reset externally
  useEffect(() => {
    setInputValue(search)
  }, [search])

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="relative max-w-sm">
        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="pl-9"
        />
      </div>
      {hasPermission(Permissions.USER_CREATE) && (
        <Button onClick={openCreateDialog}>
          <PlusIcon className="size-4" />
          Create User
        </Button>
      )}
    </div>
  )
}
