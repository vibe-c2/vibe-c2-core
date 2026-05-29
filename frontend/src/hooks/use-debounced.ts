import { useEffect, useState } from "react"

// Returns a value that lags behind the input by `ms` milliseconds — used by
// the search inputs in the wiki document picker, task picker, and task
// relations form so we don't fire a server query on every keystroke.
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
