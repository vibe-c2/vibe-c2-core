import { FlagIcon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { dayjs } from "./dayjs-setup"

interface Props {
  createdAt: string
  timezone: string
}

// OperationCreatedMarker anchors the left edge of the timeline so the
// canvas never starts visually empty, even when there are no events. Not
// stored as a real event — see spec §6.8. Flex column so the flag pin
// renders just above the axis line at the bottom of the canvas, matching
// the active-day segment baseline.
export function OperationCreatedMarker({ createdAt, timezone }: Props) {
  const d = dayjs(createdAt).tz(timezone)
  return (
    <div
      className="relative shrink-0 flex flex-col"
      style={{ width: "96px" }}
    >
      <div className="flex-1 min-h-0 flex flex-col-reverse items-center gap-1.5 pb-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-primary ring-2 ring-background"
                aria-label="Operation created"
              >
                <FlagIcon className="size-4" />
              </div>
            }
          />
          <TooltipContent>
            Operation created · {d.format("MMM D, YYYY HH:mm")}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="relative h-4 border-t border-border">
        <div className="absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
      </div>
      <div className="pt-1.5 text-center text-xs text-muted-foreground tabular-nums">
        {d.format("MMM D")}
      </div>
      <div className="pt-1 text-center text-[10px] uppercase tracking-wide text-primary/80">
        Start
      </div>
    </div>
  )
}
