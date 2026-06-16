import { GlobeIcon, SwordsIcon } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useWikiTreeModeStore,
  type WikiTreeMode,
} from "@/stores/wiki-tree-mode"
import { PUBLIC_OPERATION_NAME } from "@/lib/public-operation"

interface WikiTreeModeToggleProps {
  /**
   * When false, no operation is scoped: the Operation tab is hidden, but Public
   * (a global, scope-independent tree) stays selectable.
   */
  hasRealScope: boolean
  /** Display name of the scoped operation (shown in the toggle tooltip). */
  operationName?: string | null
}

const ALL_TAB_VALUES = [
  "operation",
  "public",
] as const satisfies readonly WikiTreeMode[]

export function WikiTreeModeToggle({
  hasRealScope,
  operationName,
}: WikiTreeModeToggleProps) {
  const mode = useWikiTreeModeStore((s) => s.mode)
  const setMode = useWikiTreeModeStore((s) => s.setMode)

  // Icon-only segmented control so the toggle fits next to the action toolbar
  // in the same row. Tooltips disambiguate which tree each segment selects.
  // The Operation segment only appears when a real operation is scoped.
  const operationLabel = operationName ?? "Operation"
  return (
    <Tabs
      value={mode}
      onValueChange={(v) => {
        // base-ui's Tabs onValueChange emits the raw selected value; narrow to
        // the modes we own to avoid swallowing an unrelated programmatic value.
        if ((ALL_TAB_VALUES as readonly string[]).includes(v as string)) {
          setMode(v as WikiTreeMode)
        }
      }}
      className="gap-0"
    >
      <TabsList className="h-7 gap-0.5 p-0.5">
        {hasRealScope && (
          <Tooltip>
            <TooltipTrigger
              render={
                <TabsTrigger
                  value="operation"
                  aria-label={`Show ${operationLabel} tree`}
                  className="size-6 p-0"
                />
              }
            >
              <SwordsIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{operationLabel}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <TabsTrigger
                value="public"
                aria-label={`Show ${PUBLIC_OPERATION_NAME} tree`}
                className="size-6 p-0"
              />
            }
          >
            <GlobeIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{PUBLIC_OPERATION_NAME}</TooltipContent>
        </Tooltip>
      </TabsList>
    </Tabs>
  )
}
