import { useEffect, useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"
import { Input } from "@/components/ui/input"

interface TableSearchInputProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  debounceMs?: number
}

export function TableSearchInput({
  value,
  onValueChange,
  placeholder = "Search...",
  debounceMs = 300,
}: TableSearchInputProps) {
  // Debounce search input — local state syncs to caller after delay
  const [inputValue, setInputValue] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => onValueChange(inputValue), debounceMs)
    return () => clearTimeout(timeout)
  }, [inputValue, onValueChange, debounceMs])

  // Keep local input in sync if external value is reset
  useEffect(() => {
    setInputValue(value)
  }, [value])

  return (
    <div className="relative w-full max-w-md">
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        className={inputValue ? "pl-9 pr-8" : "pl-9"}
      />
      {inputValue && (
        <button
          type="button"
          onClick={() => setInputValue("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
