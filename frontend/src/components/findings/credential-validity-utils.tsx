import {
  CheckCircle2Icon,
  CircleDashedIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CredentialValidity } from "@/graphql/gql/graphql"

// The three states in the order they're offered in menus and pickers:
// unknown first, because it is where every credential starts.
export const CREDENTIAL_VALIDITIES: CredentialValidity[] = [
  "UNKNOWN",
  "VALID",
  "INVALID",
]

interface ValidityPresentation {
  label: string
  // The longer form, for tooltips: says what the state means rather than
  // naming it, since "Unknown" on its own reads like missing data.
  description: string
  icon: LucideIcon
  // Icon colour. UNKNOWN is deliberately neutral — untested is not a
  // failure, and colouring it like one is the confusion this state exists
  // to end.
  className: string
}

const PRESENTATION: Record<CredentialValidity, ValidityPresentation> = {
  UNKNOWN: {
    label: "Untested",
    description: "Recorded, but nobody has tried it yet",
    icon: CircleDashedIcon,
    className: "text-muted-foreground/60",
  },
  VALID: {
    label: "Valid",
    description: "Used successfully against the target",
    icon: CheckCircle2Icon,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  INVALID: {
    label: "Invalid",
    description: "Tried, and the target rejected it",
    icon: XCircleIcon,
    className: "text-destructive",
  },
}

export function credentialValidity(v: CredentialValidity): ValidityPresentation {
  return PRESENTATION[v] ?? PRESENTATION.UNKNOWN
}

// The icon on its own, sized for a table cell or a chip.
export function CredentialValidityIcon({
  validity,
  className,
}: {
  validity: CredentialValidity
  className?: string
}) {
  const { icon: Icon, className: tone } = credentialValidity(validity)
  return <Icon className={`${tone} ${className ?? "size-4"}`} />
}

// The footer control on the create/edit forms, where a Switch used to sit.
// A switch could only ask "is this valid?", which is what forced untested
// credentials to answer no.
export function CredentialValiditySelect({
  value,
  onValueChange,
  id,
  disabled,
}: {
  value: CredentialValidity
  onValueChange: (v: CredentialValidity) => void
  id?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted-foreground">
        Validity
      </label>
      <Select
        value={value}
        onValueChange={(v) => onValueChange(v as CredentialValidity)}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CREDENTIAL_VALIDITIES.map((v) => (
            <SelectItem key={v} value={v}>
              <span className="flex items-center gap-2">
                <CredentialValidityIcon
                  validity={v}
                  className="size-3.5 shrink-0"
                />
                {credentialValidity(v).label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
