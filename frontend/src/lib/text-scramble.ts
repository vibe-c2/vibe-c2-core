// "Deobfuscation" text effect: characters start as random glyphs and resolve
// into the target string left to right as progress goes from 0 to 1. Pure so
// the resolution order can be tested; the hook drives progress with time.

const GLYPHS = "!<>-_\\/[]{}=+*^?#%&@0123456789ABCDEF"

// How much of the timeline is spent fully scrambled before any character
// settles, so the effect is readable as "resolving" rather than a flicker.
const SETTLE_START = 0.2

export function scrambleAt(target: string, progress: number, random: () => number = Math.random): string {
  const p = Math.min(1, Math.max(0, progress))
  if (p >= 1) return target

  const settleProgress = Math.max(0, (p - SETTLE_START) / (1 - SETTLE_START))
  const settledCount = Math.floor(settleProgress * target.length)

  return Array.from(target, (ch, i) => {
    if (ch === " ") return ch // spaces never scramble, so the word shape holds
    if (i < settledCount) return ch
    return GLYPHS[Math.floor(random() * GLYPHS.length)]
  }).join("")
}
