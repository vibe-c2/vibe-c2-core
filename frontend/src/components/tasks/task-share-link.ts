// Builds the shareable deep-link URL for a task. Opening this URL lands
// the recipient on the Tasks page with the task details dialog open. Mirrors
// `buildCredentialShareUrl` — consumed by the task card context menu and the
// details dialog header.
export function buildTaskShareUrl(taskId: string): string {
  return `${window.location.origin}/tasks?task=${encodeURIComponent(taskId)}`
}
