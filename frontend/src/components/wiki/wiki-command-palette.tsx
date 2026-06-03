import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, useNavigate } from "react-router";
import { SearchIcon, XIcon } from "lucide-react";
import { create } from "zustand";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogOverlay } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWikiSearch } from "@/graphql/hooks/wiki";
import type { WikiSearchQuery } from "@/graphql/gql/graphql";
import { DocumentIcon } from "@/components/wiki/document-icon";
import {
  WikiAncestorBreadcrumb,
  type AncestorCrumb,
} from "@/components/wiki/wiki-ancestor-breadcrumb";
import {
  HighlightedRanges,
  HighlightedSubstring,
} from "@/components/wiki/wiki-highlight";
import { cn, isPlainLeftClick } from "@/lib/utils";

// Shape passed back to the caller on pick. A subset of what `useWikiSearch`
// projects per hit — enough for typical post-pick work (insert a wiki
// reference node, add a relation, render a chip).
export interface PickedWikiDocument {
  id: string;
  title: string;
  emoji: string;
  icon: string;
  color: string;
}

// One result row as projected by the WikiSearch query (document + snippet +
// match ranges). Derived from the generated type so the row shape can't drift
// from the query.
type WikiSearchHit = WikiSearchQuery["wikiSearch"]["hits"][number];

interface PaletteScope {
  parentDocumentId: string | null;
  parentTitle: string;
}

// The palette runs in one of two modes. `navigate` is the Cmd+K / "search
// within X" surface that opens the chosen doc. `pick` is the imperative
// document picker that every reference surface (the /doc slash command, the
// move dialog's parent chooser, the task edit dialog's wiki references) opens
// via openWikiDocumentPicker — it hands the chosen doc back through onPick and
// never navigates.
interface NavigateConfig {
  mode: "navigate";
  operationId: string;
  scope: PaletteScope;
}

interface PickConfig {
  mode: "pick";
  operationId: string;
  excludeIds: string[];
  title: string;
  description: string;
  onPick: (doc: PickedWikiDocument) => void;
}

type PaletteConfig = NavigateConfig | PickConfig;

interface OpenSearchArgs {
  operationId: string;
  parentDocumentId: string | null;
  parentTitle: string;
}

interface OpenPickArgs {
  operationId: string;
  /** Document IDs that should appear muted and reject selection (e.g. the
   *  current doc when called from the /doc slash command, already-added
   *  references in the task dialog, or the moved doc + its descendants in the
   *  move dialog). */
  excludeIds?: string[];
  /** Override for the header label — defaults to "Insert document reference". */
  title?: string;
  /** Optional context line shown under the search box. */
  description?: string;
  onPick: (doc: PickedWikiDocument) => void;
}

interface PaletteStore {
  config: PaletteConfig | null;
  openNavigate: (args: OpenSearchArgs) => void;
  openPick: (args: OpenPickArgs) => void;
  close: () => void;
}

// Singleton store — the palette is mounted once in AppLayout and any surface
// (tree search, /doc slash command, move dialog, task edit dialog) drives it
// imperatively. Replaces the old wiki-store `searchScope` field and the
// separate wiki-document-picker dialog/store; both search surfaces now share
// this one component and the ranked `wikiSearch` backend.
const usePaletteStore = create<PaletteStore>((set) => ({
  config: null,
  openNavigate: ({ operationId, parentDocumentId, parentTitle }) =>
    set({
      config: {
        mode: "navigate",
        operationId,
        scope: { parentDocumentId, parentTitle },
      },
    }),
  openPick: ({ operationId, excludeIds, title, description, onPick }) =>
    set({
      config: {
        mode: "pick",
        operationId,
        excludeIds: excludeIds ?? [],
        title: title ?? "Insert document reference",
        description: description ?? "",
        onPick,
      },
    }),
  close: () => set({ config: null }),
}));

/** Open the palette in navigate mode (Cmd+K / "search within"). */
// eslint-disable-next-line react-refresh/only-export-components
export function openWikiSearch(args: OpenSearchArgs) {
  usePaletteStore.getState().openNavigate(args);
}

/** Open the palette in pick mode — same imperative entry point every
 *  reference surface used before the unification. */
// eslint-disable-next-line react-refresh/only-export-components
export function openWikiDocumentPicker(args: OpenPickArgs) {
  usePaletteStore.getState().openPick(args);
}

export function WikiCommandPalette() {
  const config = usePaletteStore((s) => s.config);
  const close = usePaletteStore((s) => s.close);
  const open = config !== null;

  // Keep the last config alive across the exit animation. base-ui holds the
  // Popup in the DOM for ~100ms while `data-closed` fades it out; if we gate
  // the children on `config`, they vanish at t=0 and the overlay fades out
  // around an empty box — a full-page blink. Storing the carry-over in state
  // (rather than a ref written during render) keeps the Hooks rules happy and
  // rerenders correctly when the palette opens again.
  const [lastConfig, setLastConfig] = useState(config);
  if (config !== null && config !== lastConfig) setLastConfig(config);
  const renderConfig = config ?? lastConfig;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed left-1/2 top-[15%] z-50 w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-xl bg-popover ring-1 ring-foreground/10 outline-none shadow-xl duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
          {renderConfig && (
            <PaletteBody config={renderConfig} onClose={close} />
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface PaletteBodyProps {
  config: PaletteConfig;
  onClose: () => void;
}

function PaletteBody({ config, onClose }: PaletteBodyProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  // Raw cursor as last expressed by keyboard/hover. The render path reads the
  // derived `activeIndex` below, which clamps to range and skips excluded rows.
  const [rawActiveIndex, setRawActiveIndex] = useState(0);

  const isPick = config.mode === "pick";
  // Pick mode searches the whole operation; navigate mode honors the subtree
  // scope the user opened search from.
  const scopeId = config.mode === "navigate" ? config.scope.parentDocumentId : null;

  const excludeSet = useMemo(
    () => new Set(config.mode === "pick" ? config.excludeIds : []),
    [config],
  );

  useEffect(() => {
    // 300ms balances "feels responsive" with "fewer in-flight requests" for
    // backend searches over large wikis. The server-side regex over content
    // is the heaviest branch; we'd rather one full search than three partials
    // during fast typing.
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
    setRawActiveIndex(0);
  }

  // Empty query is now a valid request: the backend returns a browse page
  // (active docs, newest-updated first) so the palette shows something to
  // choose from before the user types.
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useWikiSearch({
      operationId: config.operationId,
      scope: scopeId,
      query: debounced,
    });

  const hits = useMemo(
    () => data?.pages.flatMap((p) => p.wikiSearch.hits) ?? [],
    [data],
  );

  const total = data?.pages[0]?.wikiSearch.total ?? 0;

  // Derive the effective active row from the raw cursor: clamp into range, and
  // if it points at an excluded row (initial load, or the reset-to-0 on a new
  // query), fall through to the nearest selectable row — forward first, then
  // back. Render, Enter, and scroll all read this, so the highlight never
  // sticks on a no-op "already linked" row.
  const activeIndex = useMemo(() => {
    if (hits.length === 0) return 0;
    const clamped = Math.min(Math.max(rawActiveIndex, 0), hits.length - 1);
    if (!excludeSet.has(hits[clamped].document.id)) return clamped;
    for (let i = clamped + 1; i < hits.length; i++) {
      if (!excludeSet.has(hits[i].document.id)) return i;
    }
    for (let i = clamped - 1; i >= 0; i--) {
      if (!excludeSet.has(hits[i].document.id)) return i;
    }
    return clamped; // every row excluded — nothing selectable
  }, [hits, excludeSet, rawActiveIndex]);

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

  const pickHit = useCallback(
    (doc: PickedWikiDocument) => {
      if (config.mode !== "pick") return;
      if (excludeSet.has(doc.id)) return;
      config.onPick(doc);
      onClose();
    },
    [config, excludeSet, onClose],
  );

  // Selecting an ancestor crumb references that parent document — the pick-mode
  // mirror of navigate mode's "click a crumb to open the ancestor". The crumb
  // shape carries everything PickedWikiDocument needs (color is optional on a
  // crumb; default to empty).
  const pickCrumb = useCallback(
    (crumb: AncestorCrumb) => {
      pickHit({
        id: crumb.id,
        title: crumb.title,
        emoji: crumb.emoji,
        icon: crumb.icon,
        color: crumb.color ?? "",
      });
    },
    [pickHit],
  );

  // Shared handler for navigate-mode <Link>s. Modifier-clicks fall through to
  // the browser's default new-tab/new-window behavior so the palette only
  // closes for plain navigation.
  const handleOpenClick = useCallback(
    (e: React.MouseEvent) => {
      if (isPlainLeftClick(e)) onClose();
    },
    [onClose],
  );

  // Move the cursor to the next/previous selectable row, skipping excluded
  // rows (pick mode only — navigate mode has an empty exclude set so the loop
  // degrades to a plain ±1 step). Steps from the derived `activeIndex` so a
  // corrected cursor (see the useMemo above) advances from where it's shown.
  const step = useCallback(
    (dir: 1 | -1) => {
      for (let i = activeIndex + dir; i >= 0 && i < hits.length; i += dir) {
        if (!excludeSet.has(hits[i].document.id)) {
          setRawActiveIndex(i);
          return;
        }
      }
    },
    [activeIndex, hits, excludeSet],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const hit = hits[activeIndex];
        if (!hit) return;
        if (isPick) pickHit(hit.document);
        else openHit(hit.document.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [hits, activeIndex, isPick, pickHit, openHit, onClose, step],
  );

  const headerLabel =
    config.mode === "navigate" ? config.scope.parentTitle : config.title;
  const description = config.mode === "pick" ? config.description : "";

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <Badge variant="outline" className="shrink-0 text-xs">
          {headerLabel}
        </Badge>
        <Input
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

      {/* Optional context line for pick surfaces ("Pick a document to move X
          under", "Link a wiki document", …). */}
      {description && (
        <p className="border-b px-4 py-2 text-xs text-muted-foreground">
          {description}
        </p>
      )}

      {/* Result list */}
      <div
        ref={listRef}
        className="max-h-[50vh] min-h-32 flex-1 overflow-y-auto"
      >
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : hits.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {debounced
              ? `No documents match ${JSON.stringify(debounced)}.`
              : "No documents in this operation yet."}
          </p>
        ) : (
          <ul className="py-1">
            {hits.map((hit, i) => (
              <PaletteRow
                key={hit.document.id}
                hit={hit}
                index={i}
                isActive={i === activeIndex}
                isExcluded={excludeSet.has(hit.document.id)}
                isPick={isPick}
                query={debounced}
                onActivate={() => setRawActiveIndex(i)}
                onPick={pickHit}
                onPickCrumb={pickCrumb}
                onLinkClick={handleOpenClick}
                onCrumbNavigate={onClose}
              />
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
          <kbd className="rounded border px-1">Enter</kbd>{" "}
          {isPick ? "to select" : "to open"}{" "}
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

interface PaletteRowProps {
  hit: WikiSearchHit;
  index: number;
  isActive: boolean;
  isExcluded: boolean;
  isPick: boolean;
  query: string;
  onActivate: () => void;
  onPick: (doc: PickedWikiDocument) => void;
  onPickCrumb: (crumb: AncestorCrumb) => void;
  /** Navigate-mode title/snippet <Link> click — closes the palette on a plain
   *  left click (modifier-clicks fall through to open in a new tab). */
  onLinkClick: (e: React.MouseEvent) => void;
  /** Navigate-mode breadcrumb crumb click — closes the palette. */
  onCrumbNavigate: () => void;
}

// One result row. It is a plain div — never a single Link/button — so the
// title, each breadcrumb crumb, and the snippet are their own interactive
// elements without nesting interactives. In navigate mode those are <Link>s
// (open the doc / ancestor); in pick mode they are <button>s (select the doc /
// ancestor). That parity is the point: picking a parent from the breadcrumb
// works exactly like navigating to it does in search.
function PaletteRow({
  hit,
  index,
  isActive,
  isExcluded,
  isPick,
  query,
  onActivate,
  onPick,
  onPickCrumb,
  onLinkClick,
  onCrumbNavigate,
}: PaletteRowProps) {
  const doc = hit.document;
  const labelClass =
    "flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left";

  return (
    <li>
      <div
        data-palette-index={index}
        className={cn(
          "mx-1 flex flex-col gap-0.5 rounded px-3 py-2",
          isActive ? "bg-accent" : "hover:bg-muted/60",
        )}
        onMouseMove={() => !isExcluded && onActivate()}
      >
        {/* Title — opens (navigate) or selects (pick) the doc. */}
        <div className="flex items-center gap-2">
          {isPick ? (
            <button
              type="button"
              disabled={isExcluded}
              onClick={() => onPick(doc)}
              className={cn(
                labelClass,
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <RowDocLabel doc={doc} query={query} />
            </button>
          ) : (
            <Link to={`/wiki/${doc.id}`} className={labelClass} onClick={onLinkClick}>
              <RowDocLabel doc={doc} query={query} />
            </Link>
          )}
          {isPick && isExcluded && (
            <span className="shrink-0 text-xs text-muted-foreground">
              already linked
            </span>
          )}
        </div>

        {/* Breadcrumb — crumbs navigate (search) or select (pick) the ancestor. */}
        <WikiAncestorBreadcrumb
          ancestors={doc.ancestors}
          className="pl-6"
          collapseAfter={3}
          highlightQuery={query}
          {...(isPick
            ? { onCrumbSelect: onPickCrumb }
            : { onCrumbClick: onCrumbNavigate })}
        />

        {/* Snippet — opens (navigate) or selects (pick) the doc. */}
        {hit.snippet &&
          (isPick ? (
            <button
              type="button"
              disabled={isExcluded}
              onClick={() => onPick(doc)}
              className="block truncate pl-6 text-left text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              <HighlightedRanges text={hit.snippet} ranges={hit.matchRanges} />
            </button>
          ) : (
            <Link
              to={`/wiki/${doc.id}`}
              className="block truncate pl-6 text-xs text-muted-foreground"
              onClick={onLinkClick}
            >
              <HighlightedRanges text={hit.snippet} ranges={hit.matchRanges} />
            </Link>
          ))}
      </div>
    </li>
  );
}

// Icon + highlighted title — the shared inner content of a row's title element
// (a <Link> in navigate mode, a <button> in pick mode). Empty titles render as
// "Untitled" so the browse-on-open list (which includes never-titled docs) and
// search results read the same.
function RowDocLabel({
  doc,
  query,
}: {
  doc: WikiSearchHit["document"];
  query: string;
}) {
  return (
    <>
      <DocumentIcon emoji={doc.emoji} icon={doc.icon} color={doc.color} />
      <span className="truncate text-sm font-medium">
        <HighlightedSubstring text={doc.title || "Untitled"} query={query} />
      </span>
    </>
  );
}
