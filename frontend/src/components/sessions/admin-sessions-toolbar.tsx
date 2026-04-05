import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { SearchInput } from "@/components/ui/search-input"

interface AdminSessionsToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  activeOnly: boolean
  onActiveOnlyChange: (value: boolean) => void
}

export function AdminSessionsToolbar({
  search,
  onSearchChange,
  activeOnly,
  onActiveOnlyChange,
}: AdminSessionsToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <SearchInput
        value={search}
        onValueChange={onSearchChange}
        placeholder="Search by username..."
      />
      <div className="flex items-center gap-2">
        <Switch
          id="admin-active-only"
          checked={activeOnly}
          onCheckedChange={onActiveOnlyChange}
        />
        <Label htmlFor="admin-active-only" className="text-sm whitespace-nowrap">
          Active only
        </Label>
      </div>
    </div>
  )
}
