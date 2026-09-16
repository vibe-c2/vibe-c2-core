import { UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/ui/search-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSkillStore } from "@/stores/skills"
import type { SkillOriginFilter } from "@/lib/skill-rows"

const ORIGIN_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All skills" },
  { value: "builtin", label: "Built in" },
  { value: "community", label: "Published" },
]

export function SkillsToolbar() {
  const { search, setSearch, originFilter, setOriginFilter, openPublishDialog } =
    useSkillStore()

  return (
    <div className="flex items-center justify-between gap-3">
      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search skills..."
      />
      <div className="flex items-center gap-3">
        <Select
          value={originFilter ?? "all"}
          onValueChange={(value) =>
            setOriginFilter(value === "all" ? null : (value as SkillOriginFilter))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORIGIN_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => openPublishDialog(null)}>
          <UploadIcon className="size-4" />
          Publish Skill
        </Button>
      </div>
    </div>
  )
}
