interface FormattedDateTimeTextProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  date: string | Date
  format?: string
}

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

function formatDateTime(date: Date, fmt: string): string {
  return fmt
    .replace("yyyy", date.getFullYear().toString())
    .replace("mm", pad(date.getMonth() + 1))
    .replace("dd", pad(date.getDate()))
    .replace("hh", pad(date.getHours()))
    .replace("MM", pad(date.getMinutes()))
    .replace("ss", pad(date.getSeconds()))
}

const DEFAULT_FORMAT = "yyyy.mm.dd hh:MM"

export function FormattedDateTimeText({
  date,
  format = DEFAULT_FORMAT,
  ...props
}: FormattedDateTimeTextProps) {
  const d = date instanceof Date ? date : new Date(date)
  return <span {...props}>{formatDateTime(d, format)}</span>
}
