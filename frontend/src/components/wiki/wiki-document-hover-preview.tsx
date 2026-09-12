import { type ReactElement } from "react"
import { PreviewCard } from "@base-ui/react/preview-card"
import { useQueryClient } from "@tanstack/react-query"
import { FileTextIcon, LayoutTemplateIcon } from "lucide-react"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import {
  useWikiDocumentPreview,
  wikiDocumentPreviewOptions,
} from "@/graphql/hooks/wiki"
import { GraphQLRequestError } from "@/lib/graphql-client"
import { relativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"

// Hover timing. Long enough that sweeping the pointer across a paragraph of
// chips opens nothing; short enough that a deliberate pause is answered.
// Wikipedia's page previews sit in the same range.
const OPEN_DELAY_MS = 500
const CLOSE_DELAY_MS = 200

// How many breadcrumb segments to show before the middle collapses to "…".
const BREADCRUMB_COLLAPSE_AFTER = 3

interface WikiDocumentHoverPreviewProps {
  id: string
  /**
   * The chip itself. It becomes the card's trigger through Base UI's render
   * prop, so it keeps its own element, class names, ref and click behaviour;
   * only the hover and focus handlers are merged in.
   */
  children: ReactElement
}

/**
 * Wikipedia-style page preview for an inline /doc chip: pause on the chip and
 * a card opens with the page's icon, title, location and opening lines. The
 * card stays open while the pointer is over it, so the text can be read, and
 * closes when the pointer leaves either.
 *
 * The data is fetched on pointer-enter, not on open, so the half-second the
 * operator waits for the card is also the round trip. Nothing is fetched for
 * a chip that is merely scrolled past.
 */
export function WikiDocumentHoverPreview({
  id,
  children,
}: WikiDocumentHoverPreviewProps) {
  const queryClient = useQueryClient()
  const prefetch = () => {
    void queryClient.prefetchQuery(wikiDocumentPreviewOptions(id))
  }

  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        render={children}
        delay={OPEN_DELAY_MS}
        closeDelay={CLOSE_DELAY_MS}
        onPointerEnter={prefetch}
        onFocus={prefetch}
      />
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="isolate z-50"
        >
          <PreviewCard.Popup
            className={cn(
              "w-80 max-w-[calc(100vw-24px)] origin-(--transform-origin) rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden",
              "duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
            )}
          >
            <WikiDocumentPreviewBody id={id} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}

function WikiDocumentPreviewBody({ id }: { id: string }) {
  const { data, isLoading, error } = useWikiDocumentPreview(id)
  const doc = data?.wikiDocument

  if (isLoading && !doc) {
    return <PreviewSkeleton />
  }

  if (error || !doc) {
    return (
      <PreviewNotice
        title={isForbiddenError(error) ? "No access" : "Page not found"}
        detail={
          isForbiddenError(error)
            ? "You don't have access to this page."
            : "It may have been deleted."
        }
      />
    )
  }

  if (doc.deletedAt) {
    return (
      <PreviewNotice
        title={doc.title || "Untitled"}
        detail="This page is in the trash."
      />
    )
  }

  const subpages = doc.childCount

  return (
    <article className="flex flex-col gap-2 p-3">
      <header className="flex flex-col gap-1">
        <h3 className="flex min-w-0 items-center gap-1.5 font-heading text-sm font-semibold leading-tight">
          <span className="flex size-4 shrink-0 items-center justify-center">
            <DocumentIcon
              emoji={doc.emoji}
              icon={doc.icon}
              color={doc.color}
              isTemplate={doc.isTemplate}
              size={16}
            />
          </span>
          <span className="truncate">{doc.title || "Untitled"}</span>
        </h3>
        {doc.ancestors.length > 0 && (
          <WikiAncestorBreadcrumb
            ancestors={doc.ancestors}
            collapseAfter={BREADCRUMB_COLLAPSE_AFTER}
            className="text-xs text-muted-foreground"
          />
        )}
      </header>

      {doc.hasContent && doc.excerpt ? (
        <p className="line-clamp-6 text-sm leading-relaxed text-foreground/90">
          {doc.excerpt}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground">
          {subpages > 0
            ? "This page has no text of its own, only sub-pages."
            : "This page is empty."}
        </p>
      )}

      <footer className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>Updated {relativeTime(doc.updatedAt)}</span>
        {subpages > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {subpages} {subpages === 1 ? "sub-page" : "sub-pages"}
            </span>
          </>
        )}
        {doc.isTemplate && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <LayoutTemplateIcon className="size-3" />
              Template
            </span>
          </>
        )}
      </footer>
    </article>
  )
}

function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 p-3" aria-busy>
      <div className="flex items-center gap-1.5">
        <span className="size-4 rounded bg-muted" />
        <span className="h-3.5 w-2/5 rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="h-3 w-full rounded bg-muted/80" />
        <span className="h-3 w-11/12 rounded bg-muted/80" />
        <span className="h-3 w-4/6 rounded bg-muted/80" />
      </div>
      <span className="h-2.5 w-1/3 rounded bg-muted/60" />
    </div>
  )
}

function PreviewNotice({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 p-3">
      <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  )
}

function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof GraphQLRequestError &&
    error.errors.some((e) => e.extensions?.code === "FORBIDDEN")
  )
}
