// mammoth ships no TypeScript definitions of its own, and there is no
// @types/mammoth on the registry (verified 2026-08-28 — `npm view @types/mammoth`
// returns 404). Rather than reach for `any` and lose type safety across the docx
// path, this declares exactly the surface we call and nothing more.
//
// Deliberately narrow: if we later need mammoth's style-map or image-handler
// options, widen this declaration alongside the call site so the two stay
// honest about each other. Named exports (not a default) because the package is
// CommonJS and this project does not enable esModuleInterop — a namespace
// import off `await import("mammoth")` works under either setting.
declare module "mammoth" {
  /** A non-fatal note emitted during conversion — an unsupported style, a
   *  dropped element. Surfaced for logging, never shown raw to the reader. */
  export interface MammothMessage {
    type: "warning" | "error"
    message: string
  }

  export interface MammothResult {
    /** The converted HTML fragment — body content only, no document shell. */
    value: string
    messages: MammothMessage[]
  }

  export interface MammothInput {
    arrayBuffer: ArrayBuffer
  }

  /** Converts a .docx into an HTML fragment. Embedded images become data: URIs
   *  by default, which is exactly what the preview CSP permits. */
  export function convertToHtml(input: MammothInput): Promise<MammothResult>

  /** Plain-text extraction, no markup. Used as the fallback when conversion
   *  produces nothing renderable. */
  export function extractRawText(input: MammothInput): Promise<MammothResult>
}
