import { useState } from "react"
import {
  ChevronDownIcon,
  EyeOffIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

interface HiddenIdentitiesPanelProps {
  // Layer 1: the built-in well-known group toggle (root, ubuntu, …).
  hideWellKnown: boolean
  onToggleWellKnown: (hide: boolean) => void
  // Layer 2: the operator's custom hidden usernames (backend-persisted).
  customHidden: string[]
  onUnhide: (name: string) => void
}

// Top-right control on the users lens. Consolidates the two hiding layers into
// one collapsible: the built-in "common accounts" group toggle, plus the
// operator's custom hidden list (added via right-clicking a user node). Always
// shows what's omitted so the graph never silently lies about what it drops.
export function HiddenIdentitiesPanel({
  hideWellKnown,
  onToggleWellKnown,
  customHidden,
  onUnhide,
}: HiddenIdentitiesPanelProps) {
  const [open, setOpen] = useState(false)
  const customCount = customHidden.length

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        render={
          <Button
            variant={customCount > 0 || hideWellKnown ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 rounded-md border bg-card/90 text-xs shadow-sm backdrop-blur"
            aria-label="Manage hidden identities"
          />
        }
      >
        <EyeOffIcon className="size-3.5" />
        {customCount > 0 ? `${customCount} hidden` : "Hide identities"}
        <ChevronDownIcon
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-1.5 w-60 rounded-md border bg-card/95 p-2 text-xs shadow-md backdrop-blur">
        {/* Layer 1: built-in well-known group toggle. */}
        <button
          type="button"
          onClick={() => onToggleWellKnown(!hideWellKnown)}
          aria-pressed={hideWellKnown}
          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/60"
          title="Hide root, ubuntu, and other accounts every host shares — they link by default but carry weak reuse signal"
        >
          <span
            className={`flex size-4 shrink-0 items-center justify-center rounded border ${
              hideWellKnown
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/40"
            }`}
          >
            {hideWellKnown && <CheckMark />}
          </span>
          <UsersIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span>Hide common accounts</span>
        </button>

        <div className="my-1.5 border-t" />

        {/* Layer 2: the operator's custom hidden usernames. */}
        <div className="px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Hidden by you
        </div>
        {customCount === 0 ? (
          <p className="px-1.5 py-1 text-muted-foreground">
            Right-click a user → Hide to add one.
          </p>
        ) : (
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {customHidden.map((name) => (
              <li
                key={name}
                className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-muted/60"
              >
                <span className="flex-1 truncate font-mono" title={name}>
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => onUnhide(name)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Unhide ${name}`}
                  title={`Unhide ${name}`}
                >
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function CheckMark() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
      <path
        d="M2.5 6.5 5 9l4.5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
