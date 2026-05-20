import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";
import { SearchIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWikiStore } from "@/stores/wiki";
import { useWikiSearch } from "@/graphql/hooks/wiki";
import { DocumentIcon } from "@/components/wiki/document-icon";
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb";
import { cn, isPlainLeftClick } from "@/lib/utils";

interface WikiCommandPaletteProps {
  operationId: string;
}

export function WikiCommandPalette({ operationId }: WikiCommandPaletteProps) {
  const scope = useWikiStore((s) => s.searchScope);
  const closeContentSearch = useWikiStore((s) => s.closeContentSearch);
  const open = scope !== null;

  // Keep the last non-null scope alive across the exit animation. base-ui
  // holds the Popup in the DOM for ~100ms while `data-closed` fades it out;
  // if we gate the children on `scope`, they vanish at t=0 and the overlay
  // fades out around an empty box — which reads as a full-page blink. Storing
  // the carry-over in state (rather than a ref written during render) keeps
  // the React Hooks rule happy and rerenders correctly when scope opens again.
  const [lastScope, setLastScope] = useState(scope);
  if (scope !== null && scope !== lastScope) setLastScope(scope);
  const renderScope = scope ?? lastScope;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeContentSearch();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-[15%] z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl bg-popover ring-1 ring-foreground/10 outline-none shadow-xl duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
          {renderScope && (
            <PaletteBody
              operationId={operationId}
              scope={renderScope}
              onClose={closeContentSearch}
            />
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface PaletteBodyProps {
  operationId: string;
  scope: { parentDocumentId: string | null; parentTitle: string };
  onClose: () => void;
}

function PaletteBody({ operationId, scope, onClose }: PaletteBodyProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    // 300ms balances "feels responsive" with "fewer in-flight requests" for
    // backend searches over large wikis. The server-side regex over content
    // is the heaviest branch; we'd rather one full search than three
    // partials during fast typing.
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset cursor when query changes — the active row would otherwise point
  // into a stale result list. Done during render via the prev-value pattern
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // rather than a setState-in-effect, which the React Hooks lint flags.
  const [lastDebounced, setLastDebounced] = useState(debounced);
  if (lastDebounced !== debounced) {
    setLastDebounced(debounced);
    setActiveIndex(0);
  }

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useWikiSearch({
      operationId,
      scope: scope.parentDocumentId,
      query: debounced,
    });

  const hits = useMemo(
    () => data?.pages.flatMap((p) => p.wikiSearch.hits) ?? [],
    [data],
  );

  const total = data?.pages[0]?.wikiSearch.total ?? 0;

  const listRef = useRef<HTMLDivElement>(null);
  // Keep the active row in view as the user arrows through results.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-palette-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Sentinel for infinite scroll — load more when the bottom enters view.
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const openHit = useCallback(
    (docId: string) => {
      navigate(`/wiki/${docId}`);
      onClose();
    },
    [navigate, onClose],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = hits[activeIndex];
        if (hit) openHit(hit.document.id);
      }
    },
    [hits, activeIndex, openHit],
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <Badge variant="outline" className="shrink-0 text-xs">
          {scope.parentTitle}
        </Badge>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search documents…"
          autoFocus
          maxLength={200}
          className="h-8 flex-1 border-none bg-transparent text-sm shadow-none focus-visible:ring-0"
        />
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* Result list */}
      <div
        ref={listRef}
        className="max-h-[50vh] min-h-32 flex-1 overflow-y-auto"
      >
        {!debounced ? (
          <PaletteHint />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : hits.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No documents match {JSON.stringify(debounced)}.
          </p>
        ) : (
          <ul className="py-1">
            {hits.map((hit, i) => (
              <li key={hit.document.id}>
                <Link
                  to={`/wiki/${hit.document.id}`}
                  data-palette-index={i}
                  className={cn(
                    "mx-1 flex cursor-pointer flex-col gap-0.5 rounded px-3 py-2 text-left",
                    i === activeIndex ? "bg-accent" : "hover:bg-muted/60",
                  )}
                  onMouseMove={() => setActiveIndex(i)}
                  onClick={(e) => {
                    if (isPlainLeftClick(e)) onClose()
                  }}
                >
                  <div className="flex items-center gap-2">
                    <DocumentIcon
                      emoji={hit.document.emoji}
                      icon={hit.document.icon}
                      color={hit.document.color}
                    />
                    <span className="truncate text-sm font-medium">
                      {hit.document.title}
                    </span>
                  </div>
                  <WikiAncestorBreadcrumb
                    ancestors={hit.document.ancestors}
                    className="truncate pl-6"
                  />
                  {hit.snippet && (
                    <p className="truncate text-xs text-muted-foreground">
                      <HighlightedText
                        text={hit.snippet}
                        ranges={hit.matchRanges}
                      />
                    </p>
                  )}
                </Link>
              </li>
            ))}
            <div ref={sentinelRef} className="h-1" />
          </ul>
        )}
      </div>

      {/* Footer — keyboard hints + result count */}
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          <kbd className="rounded border px-1">↑</kbd>{" "}
          <kbd className="rounded border px-1">↓</kbd> to navigate{" "}
          <kbd className="rounded border px-1">Enter</kbd> to open{" "}
          <kbd className="rounded border px-1">Esc</kbd> to close
        </span>
        {total > 0 && (
          <span>
            {total} result{total === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  );
}

function PaletteHint() {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
      Type to search titles and content.
    </p>
  );
}

// HighlightedText wraps rune-offset ranges in <mark>. Ranges come from the
// server and reference rune offsets in `text` — JS strings iterate by code
// units, so we decode to an array of codepoints first to keep offsets aligned.
function HighlightedText({
  text,
  ranges,
}: {
  text: string;
  ranges: readonly { start: number; end: number }[];
}) {
  if (!ranges || ranges.length === 0) return <>{text}</>;

  const runes = Array.from(text); // codepoint-aware split

  const sorted = [...ranges]
    .filter((r) => r.start < r.end && r.start >= 0 && r.end <= runes.length)
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) return <>{text}</>;

  const out: ReactNode[] = [];
  let cursor = 0;
  sorted.forEach((r, i) => {
    if (r.start < cursor) return; // skip overlaps
    if (r.start > cursor) out.push(runes.slice(cursor, r.start).join(""));
    out.push(
      <mark
        key={i}
        className="rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-800/70"
      >
        {runes.slice(r.start, r.end).join("")}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < runes.length) out.push(runes.slice(cursor).join(""));
  return <>{out}</>;
}
