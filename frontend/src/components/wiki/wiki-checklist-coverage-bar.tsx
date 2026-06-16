interface WikiChecklistCoverageBarProps {
  /** Total checklist items in the document — the coverage-bar denominator and
   * the gate for whether the bar renders at all. */
  total: number
  answered: number
  /** Number of items flagged `required`. Surfaced only as a secondary hint in
   * the tooltip; not the denominator. */
  required?: number
  /** Compact variant for tree rows / list cells. */
  compact?: boolean
  className?: string
}

/**
 * Per-document checklist coverage indicator. Renders nothing for documents with
 * no checklist items (total === 0), so it can be dropped into any wiki document
 * header unconditionally — only documents that actually contain checklist items
 * show a bar, regardless of whether those items are required.
 *
 * The numbers come straight from WikiDocument.checklistTotal /
 * .checklistAnswered (and .checklistRequired for the hint), which the Hocuspocus
 * sidecar projects on every save.
 */
export function WikiChecklistCoverageBar({
  total,
  answered,
  required = 0,
  compact = false,
  className,
}: WikiChecklistCoverageBarProps) {
  if (total <= 0) return null

  const clampedAnswered = Math.max(0, Math.min(answered, total))
  const pct = Math.round((clampedAnswered / total) * 100)
  const complete = clampedAnswered >= total
  const requiredHint =
    required > 0 ? ` (${required} required)` : ""

  return (
    <div
      className={`wiki-checklist-coverage${compact ? " wiki-checklist-coverage--compact" : ""}${className ? ` ${className}` : ""}`}
      data-complete={complete ? "true" : "false"}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={clampedAnswered}
      aria-label={`Checklist coverage: ${clampedAnswered} of ${total} answered`}
      title={`${clampedAnswered} of ${total} items answered${requiredHint}`}
    >
      <div className="wiki-checklist-coverage__track">
        <div
          className="wiki-checklist-coverage__fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {!compact && (
        <span className="wiki-checklist-coverage__label">
          {clampedAnswered}/{total}
        </span>
      )}
    </div>
  )
}
