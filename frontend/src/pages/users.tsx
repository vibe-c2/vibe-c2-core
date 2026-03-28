import { useMemo } from "react"
import { useInfiniteUsers } from "@/graphql/hooks/users"
import { useUserStore } from "@/stores/users"
import { UsersToolbar } from "@/components/users/users-toolbar"
import { UsersTable } from "@/components/users/users-table"
import { CreateUserDialog } from "@/components/users/create-user-dialog"
import { EditUserDialog } from "@/components/users/edit-user-dialog"
import { DeleteUserDialog } from "@/components/users/delete-user-dialog"

export function UsersPage() {
  const search = useUserStore((s) => s.search)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteUsers({ search: search || null })

  const users = useMemo(
    () => data?.pages.flatMap((page) => page.users.edges.map((e) => e.node)) ?? [],
    [data],
  )

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <UsersToolbar />
      <UsersTable
        users={users}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      />
      <CreateUserDialog />
      <EditUserDialog />
      <DeleteUserDialog />
    </div>
  )
}
