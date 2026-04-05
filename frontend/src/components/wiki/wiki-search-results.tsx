import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { SearchIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useWikiStore } from "@/stores/wiki"
import { useWikiDocuments } from "@/graphql/hooks/wiki"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface WikiSearchResultsProps {
  operationId: string
  scope: { parentDocumentId: string | null; parentTitle: string }
  treeDocuments: readonly WikiDocumentTreeFieldsFragment[]
}

export function WikiSearchResults({
  operationId,
  scope,
  treeDocuments,
}: WikiSearchResultsProps) {
  const navigate = useNavigate()
  const closeContentSearch = useWikiStore((s) => s.closeContentSearch)

  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")

  // Debounce the search query (300ms).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(timer)
  }, [query])

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useWikiDocuments({
    operationId,
    parentDocumentId: scope.parentDocumentId,
    search: debouncedQuery || null,
  })

  const results = useMemo(
    () => data?.pages.flatMap((p) => p.wikiDocuments.edges.map((e) => e.node)) ?? [],
    [data],
  )

  // Build parent lookup map for breadcrumb paths.
  const parentMap = useMemo(() => {
    const map = new Map<string, { title: string; parentId: string | null }>()
    for (const doc of treeDocuments) {
      map.set(doc.id, {
        title: doc.title,
        parentId: doc.parentDocument?.id ?? null,
      })
    }
    return map
  }, [treeDocuments])

  function buildBreadcrumb(docId: string): string[] {
    const path: string[] = []
    let currentId: string | null = parentMap.get(docId)?.parentId ?? null
    while (currentId) {
      const node = parentMap.get(currentId)
      if (!node) break
      path.unshift(node.title)
      currentId = node.parentId
    }
    return path
  }

  // Infinite scroll.
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  function handleResultClick(docId: string) {
    navigate(`/wiki/${docId}`)
    closeContentSearch()
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-sm text-muted-foreground">Search in</span>
        <Badge variant="outline" className="shrink-0">
          {scope.parentTitle}
        </Badge>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents..."
          autoFocus
          className="h-7 flex-1 text-sm"
        />
        <Button variant="ghost" size="icon-sm" onClick={closeContentSearch}>
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {debouncedQuery
              ? `No documents found matching "${debouncedQuery}"`
              : "Type to search documents"}
          </p>
        ) : (
          results.map((doc) => {
            const breadcrumb = buildBreadcrumb(doc.id)
            return (
              <button
                key={doc.id}
                className="flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left hover:bg-muted/50"
                onClick={() => handleResultClick(doc.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{doc.emoji || "\u{1F4C4}"}</span>
                  <span className="text-sm font-medium">{doc.title}</span>
                </div>
                {breadcrumb.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">
                    {breadcrumb.join(" > ")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  by {doc.createdBy.username}
                </p>
              </button>
            )
          })
        )}
        <div ref={sentinelRef} className="h-1" />
      </div>
    </div>
  )
}
