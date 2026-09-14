import { describe, expect, it } from "vitest"
import { decideTableContextMenu } from "./table-context-menu-gate"

describe("decideTableContextMenu", () => {
  // The regression this guards: a right-click that is NOT in a table cell must
  // pass through to the browser. When this returned the wrong thing (or the
  // old trigger swallowed every click), the native context menu disappeared
  // from the entire wiki document.
  it("passes non-cell right-clicks through to the browser", () => {
    expect(decideTableContextMenu({ cellFound: false, isEditable: true })).toBe("passthrough")
  })

  it("opens the table menu for a right-click inside an editable cell", () => {
    expect(decideTableContextMenu({ cellFound: true, isEditable: true })).toBe("open")
  })

  it("passes cell right-clicks through when the document is read-only", () => {
    // No table actions to offer, so a cell behaves like ordinary content and
    // the browser menu should still appear.
    expect(decideTableContextMenu({ cellFound: true, isEditable: false })).toBe("passthrough")
  })

  it("passes through when there is neither a cell nor edit rights", () => {
    expect(decideTableContextMenu({ cellFound: false, isEditable: false })).toBe("passthrough")
  })
})
