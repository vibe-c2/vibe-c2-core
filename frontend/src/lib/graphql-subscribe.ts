// SSE transport for GraphQL subscriptions.
//
// Unlike the regular graphqlClient (request/response), this function opens
// a long-lived HTTP connection and streams events as they arrive.
//
// Uses fetch() + ReadableStream instead of the browser's EventSource API
// because EventSource only supports GET and can't send a JSON body.
// Auth is handled via httpOnly cookies (credentials: "include").

import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { print } from "graphql"

const API_URL = import.meta.env.VITE_API_URL

export interface SubscribeCallbacks<TResult> {
  onNext: (data: TResult) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

/**
 * Opens an SSE connection for a GraphQL subscription.
 *
 * Sends a POST to /graphql with Accept: text/event-stream. The server
 * holds the connection open and streams SSE frames:
 *   event: next\ndata: {"data": {...}}\n\n   — one per event
 *   event: complete\n\n                      — when the server is done
 *
 * Returns an AbortController — call controller.abort() to disconnect.
 */
export function graphqlSubscribe<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables | undefined,
  callbacks: SubscribeCallbacks<TResult>,
): AbortController {
  const controller = new AbortController()

  // Launch the connection asynchronously. Errors are routed to the callback.
  void connect(document, variables, callbacks, controller)

  return controller
}

async function connect<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables | undefined,
  { onNext, onError, onComplete }: SubscribeCallbacks<TResult>,
  controller: AbortController,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        query: print(document),
        variables,
      }),
      signal: controller.signal,
      credentials: "include",
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      onError?.(new Error(`Subscription failed (${res.status}): ${text}`))
      return
    }

    if (!res.body) {
      onError?.(new Error("Response body is null — streaming not supported"))
      return
    }

    // Parse the SSE stream line by line.
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ""
    let currentEvent = ""
    let dataBuffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += value
      const lines = buffer.split("\n")
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line[6] === " " ? line.slice(7) : line.slice(6)
        } else if (line.startsWith("data:")) {
          // Per SSE spec: strip only the single space after "data:", not all whitespace.
          const payload = line[5] === " " ? line.slice(6) : line.slice(5)
          // Multi-line data fields are joined with newlines.
          dataBuffer += dataBuffer ? "\n" + payload : payload
        } else if (line === "" && (currentEvent || dataBuffer)) {
          // Blank line = end of SSE frame, dispatch the event.
          if (currentEvent === "next" && dataBuffer) {
            try {
              const json = JSON.parse(dataBuffer) as { data: TResult }
              if (import.meta.env.DEV) {
                console.debug("[SSE] event:", json.data)
              }
              onNext(json.data)
            } catch {
              onError?.(new Error(`Failed to parse SSE data: ${dataBuffer}`))
            }
          } else if (currentEvent === "complete") {
            onComplete?.()
          }
          currentEvent = ""
          dataBuffer = ""
        }
      }
    }

    // Stream ended naturally
    onComplete?.()
  } catch (err: unknown) {
    // AbortError means we intentionally disconnected — not an error.
    if (err instanceof DOMException && err.name === "AbortError") {
      return
    }
    onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}
