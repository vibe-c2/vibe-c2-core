// avatarLabel computes the short text shown inside a user's avatar fallback
// (we don't have profile pictures).
//
// In production every account is named "user<number>" — user01, user422, etc.
// For those, the leading "user" prefix is pure noise repeated on every avatar,
// so we drop it and render just the number (01, 422). For any other shape we
// fall back to classic initials: first 1–2 letters, or the first letter of the
// first two name parts when the name splits on spaces/dots/dashes/underscores.
//
// The number is rendered verbatim (user01 -> "01", user422 -> "422") so two
// distinct accounts never collapse to the same avatar label.
const USER_NUMBER_PATTERN = /^user(\d+)$/i

export function avatarLabel(username: string): string {
  const trimmed = username.trim()
  if (!trimmed) return "?"

  const userNumber = trimmed.match(USER_NUMBER_PATTERN)
  if (userNumber) return userNumber[1]

  const parts = trimmed.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
