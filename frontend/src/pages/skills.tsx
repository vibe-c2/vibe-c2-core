import { useMemo, useState } from "react"
import { FileCode2Icon, UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchInput } from "@/components/ui/search-input"
import { BuiltinSkillCard } from "@/components/skills/builtin-skill-card"
import { PublishSkillDialog } from "@/components/skills/publish-skill-dialog"
import { SkillCard } from "@/components/skills/skill-card"
import { useSkillRegistry } from "@/graphql/hooks/skills"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { useAuthStore } from "@/stores/auth"

/**
 * Skills, in two sections.
 *
 * The split is about accountability rather than quality: the built-in skill is
 * the platform's to keep current, and a published one is its author's. That
 * distinction decides whether an operator has anyone to ask when a skill is
 * wrong, so it is the first thing the page shows.
 */
export function SkillsPage() {
  usePageMetadata({
    title: "Skills",
    icon: { kind: "lucide", component: FileCode2Icon },
  })

  const [search, setSearch] = useState("")
  const [publishing, setPublishing] = useState(false)
  const [publishingName, setPublishingName] = useState<string | null>(null)
  // The wildcard role, the same check the wiki trash panel makes. An admin
  // can retire any skill; an author can retire their own.
  const isAdmin = useAuthStore(
    (state) => state.user?.roles.includes("admin") ?? false,
  )

  const { data, isLoading } = useSkillRegistry()
  const skills = useMemo(() => {
    const all = data?.skillRegistry.skills ?? []
    const query = search.trim().toLowerCase()
    if (!query) return all
    return all.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.ownerUsername.toLowerCase().includes(query),
    )
  }, [data, search])

  function openPublish(name: string | null) {
    setPublishingName(name)
    setPublishing(true)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4">
      <section className="space-y-2">
        <header>
          <h2 className="text-sm font-medium">Built in</h2>
          <p className="text-xs text-muted-foreground">
            Shipped and kept current with the platform.
          </p>
        </header>
        <BuiltinSkillCard />
      </section>

      <section className="space-y-2">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">Published by operators</h2>
            <p className="text-xs text-muted-foreground">
              Written by the people using this server. Nobody reviews them, so
              read one before you let an agent follow it.
            </p>
          </div>
          <Button size="sm" onClick={() => openPublish(null)}>
            <UploadIcon className="size-4" />
            Publish
          </Button>
        </header>

        {(data?.skillRegistry.skills.length ?? 0) > 4 && (
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder="Search by name, description or author"
          />
        )}

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : skills.length === 0 ? (
          <EmptyState searching={search.trim().length > 0} />
        ) : (
          <div className="space-y-2">
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                canRetire={skill.mine || isAdmin}
                onPublishNewVersion={openPublish}
              />
            ))}
          </div>
        )}
      </section>

      <PublishSkillDialog
        open={publishing}
        onOpenChange={setPublishing}
        existingName={publishingName}
        maxUploadBytes={data?.skillRegistry.maxUploadBytes ?? 0}
      />
    </div>
  )
}

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">
        {searching
          ? "No skill matches that."
          : "Nobody has published a skill yet."}
      </p>
      {!searching && (
        <p className="mt-1 text-xs text-muted-foreground">
          Zip a skill directory and publish it to share how you work.
        </p>
      )}
    </div>
  )
}
