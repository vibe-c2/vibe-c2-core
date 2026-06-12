import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInfiniteCredentials } from "@/graphql/hooks/credentials";
import { flattenConnection } from "@/lib/connection";
import { credentialTypeLabel } from "@/components/findings/credential-type-utils";
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql";
import { cn } from "@/lib/utils";

/**
 * Searchable credential list with keyboard navigation and infinite scroll.
 * Shared across every credential-picking surface — the wiki "Insert credential
 * reference" picker, the findings "Mark hash as cracked" dialog, and the task
 * relations editor — so they render identical rows, use the same keyboard
 * model, and stay in sync as the design evolves.
 *
 * The search input is owned by the caller so it can be reused across modes
 * (e.g. seed the create-new form with the current query in wiki). Pass
 * `excludeIds` from multi-select callers (tasks) to hide already-picked rows.
 */
interface CredentialPickerListProps {
  operationId: string;
  search: string;
  onSearchChange: (search: string) => void;
  /**
   * Fired with the full picked credential node so callers can use any field
   * (id for references, name for a chip label, etc.) without a second fetch.
   */
  onPick: (credential: CredentialFieldsFragment) => void;
  /**
   * Credential ids to hide from the list — e.g. ones already linked in a
   * multi-select surface (task relations). Filtered client-side after the
   * page fetch so keyboard nav and the empty state see the same set.
   */
  excludeIds?: ReadonlySet<string>;
  /** When provided, renders a footer with a "Create new credential" CTA. */
  onStartCreate?: () => void;
  /** Optional footer slot (overrides the default create CTA). */
  footer?: ReactNode;
}

export function CredentialPickerList({
  operationId,
  search,
  onSearchChange,
  onPick,
  excludeIds,
  onStartCreate,
  footer,
}: CredentialPickerListProps) {
  const [debounced, setDebounced] = useState(search.trim());
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 180);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const [lastDebounced, setLastDebounced] = useState(debounced);
  if (lastDebounced !== debounced) {
    setLastDebounced(debounced);
    setActiveIndex(0);
  }

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteCredentials({
      operationId,
      search: debounced || null,
      validOnly: null,
      first: 20,
    });

  const credentials = useMemo(() => {
    const all = flattenConnection(data, (p) => p.credentials);
    return excludeIds ? all.filter((c) => !excludeIds.has(c.id)) : all;
  }, [data, excludeIds]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) =>
        Math.min(i + 1, Math.max(credentials.length - 1, 0)),
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cred = credentials[activeIndex];
      if (cred) onPick(cred);
    }
  }

  const resolvedFooter =
    footer ??
    (onStartCreate ? (
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          Can&apos;t find it? Add it to this operation.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStartCreate}
        >
          <PlusIcon className="size-3.5" />
          Create new credential
        </Button>
      </div>
    ) : null);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search by name, username, or password…"
          className="pl-8"
        />
      </div>
      <div
        className="max-h-72 overflow-y-auto rounded-md border bg-card"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (
            hasNextPage &&
            !isFetchingNextPage &&
            el.scrollTop + el.clientHeight >= el.scrollHeight - 32
          ) {
            void fetchNextPage();
          }
        }}
      >
        {isLoading && credentials.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        ) : credentials.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            {debounced
              ? "No credentials match this search."
              : "No credentials in this operation yet."}
          </div>
        ) : (
          credentials.map((c, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={c.id}
                ref={(el) => {
                  if (isActive) activeItemRef.current = el;
                }}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(c)}
                aria-selected={isActive}
                className={cn(
                  "flex w-full items-start gap-2 border-b px-3 py-2 text-left text-sm outline-hidden last:border-b-0",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <KeyIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 break-words font-medium">
                  {c.name}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {credentialTypeLabel(c.type)}
                </Badge>
                <CredentialMeta username={c.username} password={c.password} />
              </button>
            );
          })
        )}
        {isFetchingNextPage && (
          <div className="p-2 text-center text-xs text-muted-foreground">
            Loading more…
          </div>
        )}
      </div>
      {resolvedFooter}
    </div>
  );
}

/**
 * Trailing username · password hint on a credential row. Hidden below `sm`
 * where the row is too narrow; password rendered monospace so it reads as a
 * secret value rather than prose. Renders nothing when the credential carries
 * neither (e.g. a key-only SSH credential).
 */
function CredentialMeta({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  if (!username && !password) return null;
  return (
    <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
      {username ? (
        <span className="max-w-[12ch] truncate">{username}</span>
      ) : null}
      {username && password ? (
        <span className="text-muted-foreground/50">·</span>
      ) : null}
      {password ? (
        <span className="max-w-[12ch] truncate font-mono text-muted-foreground/80">
          {password}
        </span>
      ) : null}
    </span>
  );
}
