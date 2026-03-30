import {
  GlobeIcon,
  MonitorIcon,
  SmartphoneIcon,
  BotIcon,
  XIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import type { SessionFieldsFragment } from "@/graphql/gql/graphql"

interface SessionItemProps {
  session: SessionFieldsFragment
  onRevoke?: (sessionId: string) => void
  showUser?: boolean
  username?: string
}

function DeviceIcon({ device }: { device: string }) {
  switch (device.toLowerCase()) {
    case "mobile":
      return <SmartphoneIcon className="size-4 shrink-0" />
    case "bot":
      return <BotIcon className="size-4 shrink-0" />
    case "desktop":
      return <MonitorIcon className="size-4 shrink-0" />
    default:
      return <GlobeIcon className="size-4 shrink-0" />
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return "Just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString()
}

const terminationLabels: Record<string, string> = {
  LOGOUT: "Logged out",
  EXPIRED: "Expired",
  EVICTED: "Evicted",
  REPLAY_DETECTED: "Security revoke",
  ADMIN_REVOKED: "Admin revoked",
  USER_REVOKED: "User revoked",
}

export function SessionItem({ session, onRevoke, showUser, username }: SessionItemProps) {
  const isActive = session.status === "ACTIVE"
  const canRevoke = isActive && !session.isCurrent && !!onRevoke

  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <div className="mt-0.5">
        <DeviceIcon device={session.device} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">
            {session.browser || "Unknown browser"}
          </span>
          {session.isCurrent && (
            <Badge variant="default" className="text-xs">
              This device
            </Badge>
          )}
          {isActive ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <span className="size-1.5 rounded-full bg-green-600 dark:bg-green-400" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/50" />
              {session.terminationReason
                ? terminationLabels[session.terminationReason] ?? session.terminationReason
                : "Inactive"}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {showUser && username && (
            <div>User: <span className="font-medium text-foreground">{username}</span></div>
          )}
          <div>
            {session.os} &middot; {session.device} &middot; {session.ipAddress}
          </div>
          <div>
            Last active: {formatRelativeTime(session.lastActivityAt)}
            {" "}&middot;{" "}
            Created: <FormattedDateTimeText date={session.createdAt} />
          </div>
        </div>
      </div>
      {canRevoke && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRevoke(session.id)}
          title="Revoke session"
        >
          <XIcon className="size-4" />
        </Button>
      )}
    </div>
  )
}
