import { createContext, useContext } from "react"

// Signals that the React subtree below is being rendered for print/PDF
// export. Viewport-gated data fetching and lazy image loading both flip
// to "load everything now" so the printed page captures every chip and
// image, not just whatever happened to be near the initial viewport.
const PrintModeContext = createContext(false)

export const PrintModeProvider = PrintModeContext.Provider

export function usePrintMode(): boolean {
  return useContext(PrintModeContext)
}
