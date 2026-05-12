import { useCallback, useEffect, useMemo } from "react"
import { useSearchParams } from "react-router"
import { useAuthStore } from "@/stores/auth"

// URL search-param key used to encode the multi-op selection on the global
// Findings page. We keep the key short ("ops") because the value can already
// be long for multi-id selections.
const OPS_PARAM = "ops"

// Sentinel for "all my operations". Avoids ambiguity with an empty string
// (which we treat as "no selection" → fall back to default).
const ALL_SENTINEL = "all"

// localStorage key holding the *last* picker value per user. Used as a default
// on first visit (URL has no ?ops=). The URL remains the source of truth once
// it's set on a given navigation.
const lastOpsStorageKey = (userId: string | undefined) =>
  userId ? `findings:lastOps:${userId}` : null

// UUID regex (RFC 4122-style). Cheap defensive check so a malformed URL doesn't
// poison downstream queries with garbage IDs.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

function parseValue(raw: string | null): string[] | null | undefined {
  if (raw == null) return undefined
  const trimmed = raw.trim()
  if (trimmed === "" || trimmed === ALL_SENTINEL) return null
  const ids = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
  if (ids.length === 0) return null
  // De-duplicate while preserving order — keeps URLs idempotent on reload.
  return Array.from(new Set(ids))
}

function encodeValue(value: string[] | null): string {
  if (value === null) return ALL_SENTINEL
  return value.join(",")
}

// Returns the current multi-op selection, plus a setter that writes both the
// URL search param and the per-user localStorage default.
//
// Semantics:
//   - operationIds === null: "all my operations" (server resolves)
//   - operationIds.length === 0: explicit empty (returns no rows)
//   - operationIds.length >= 1: caller-picked subset (UUIDs)
export function useFindingsOpsParam() {
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = useAuthStore((s) => s.user?.userId)

  const fromUrl = useMemo(
    () => parseValue(searchParams.get(OPS_PARAM)),
    [searchParams],
  )

  // Hydrate the URL from localStorage the first time we land here without a
  // ?ops= param. Subsequent navigations within the SPA keep the URL authoritative.
  useEffect(() => {
    if (fromUrl !== undefined) return
    const key = lastOpsStorageKey(userId)
    if (!key) return
    const stored = window.localStorage.getItem(key)
    const parsed = parseValue(stored)
    if (parsed === undefined) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set(OPS_PARAM, encodeValue(parsed))
        return next
      },
      { replace: true },
    )
  }, [fromUrl, userId, setSearchParams])

  // Default selection when neither URL nor localStorage has a value: "all".
  const operationIds: string[] | null = fromUrl === undefined ? null : fromUrl

  const setOperationIds = useCallback(
    (next: string[] | null) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set(OPS_PARAM, encodeValue(next))
          return params
        },
        { replace: true },
      )
      const key = lastOpsStorageKey(userId)
      if (key) {
        try {
          window.localStorage.setItem(key, encodeValue(next))
        } catch {
          // Storage quotas / private mode — fail open; URL remains authoritative.
        }
      }
    },
    [setSearchParams, userId],
  )

  return { operationIds, setOperationIds }
}
