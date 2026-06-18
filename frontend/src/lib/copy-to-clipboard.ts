import { toast } from "sonner"

// Shared "copy text + toast" helper. Every call site wants the same three
// outcomes — nothing to copy, copied, or the clipboard API refused — so they
// live here once instead of being re-implemented inline per context menu.
// `label` names the thing being copied for the toast ("IP", "CIDR", "source").
export async function copyToClipboard(text: string, label: string): Promise<void> {
  if (!text) {
    toast.info(`No ${label} to copy`)
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  } catch {
    toast.error(`Failed to copy ${label}`)
  }
}
