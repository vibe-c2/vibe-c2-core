import { Picker } from "emoji-mart";
import { useEffect, useRef } from "react";

// Thin React wrapper around emoji-mart's vanilla Picker.
//
// Replaces the @emoji-mart/react package, which was a ~20-line wrapper doing
// exactly this. Dropping it removes the only React-19 peer-dependency conflict
// in the tree — its last release (1.1.1, January 2023) still declares
// `react@"^16.8 || ^17 || ^18"`, and upstream has published nothing since, so
// there was no version to upgrade to. Owning these twenty lines is cheaper than
// carrying `npm ci --legacy-peer-deps` everywhere forever.
//
// Two things this does that the upstream wrapper did not:
//   - Prop updates happen in an effect. Upstream called picker.update(props)
//     during render, mutating an external object mid-render, which is not safe
//     under concurrent rendering.
//   - onEmojiSelect is read through a ref, so a caller passing an inline arrow
//     (as the icon picker does) does not tear down and rebuild the picker on
//     every render.
//
// The vanilla Picker is a custom element: its constructor empties the host node
// and appends itself, and its disconnectedCallback unregisters the component
// when React removes the host. We clear the host on cleanup anyway so a
// remount never renders two pickers into the same node.

/** The subset of emoji-mart's Picker options this app uses. The library's own
 *  typings declare `constructor(props: any)`, so this interface — not the
 *  library — is what gives call sites type safety. Widen it deliberately if a
 *  new option is needed. */
export interface EmojiPickerProps {
  /** Emoji dataset, imported from @emoji-mart/data. Opaque to us. */
  data: unknown;
  /** Fires with the chosen emoji; `native` is the character itself. */
  onEmojiSelect: (emoji: EmojiSelection) => void;
  theme: "light" | "dark";
  previewPosition?: "none" | "top" | "bottom";
  skinTonePosition?: "none" | "preview" | "search";
}

/** Emoji-mart emits a much larger object; these are the fields we rely on. */
export interface EmojiSelection {
  native: string;
  id: string;
}

/** Structural type for the constructed picker — the library exports the class
 *  but types its instances loosely. */
interface PickerInstance {
  update: (props: Record<string, unknown>) => void;
}

export function EmojiPicker({
  data,
  onEmojiSelect,
  theme,
  previewPosition = "none",
  skinTonePosition = "none",
}: EmojiPickerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<PickerInstance | null>(null);

  // Latest-callback ref: lets the picker be built once while still calling the
  // caller's current handler, even though that handler is a fresh closure on
  // every render.
  const onSelectRef = useRef(onEmojiSelect);
  useEffect(() => {
    onSelectRef.current = onEmojiSelect;
  }, [onEmojiSelect]);

  // Construction options are captured once. Everything that can change at
  // runtime is applied through update() in the effect below instead, so the
  // picker is never rebuilt (which would lose scroll position and focus).
  const initialRef = useRef({ data, theme, previewPosition, skinTonePosition });

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const initial = initialRef.current;
    pickerRef.current = new Picker({
      data: initial.data,
      theme: initial.theme,
      previewPosition: initial.previewPosition,
      skinTonePosition: initial.skinTonePosition,
      onEmojiSelect: (emoji: EmojiSelection) => onSelectRef.current(emoji),
      ref: hostRef,
    }) as unknown as PickerInstance;

    return () => {
      pickerRef.current = null;
      host.replaceChildren();
    };
  }, []);

  // Theme follows the app. update() takes a partial prop bag, so this repaints
  // the existing picker rather than constructing a new one.
  useEffect(() => {
    pickerRef.current?.update({ theme });
  }, [theme]);

  return <div ref={hostRef} />;
}
