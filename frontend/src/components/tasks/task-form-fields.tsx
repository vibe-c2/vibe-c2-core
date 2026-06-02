import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ScoreSwatch } from "@/components/tasks/task-badges"
import { scoreTone } from "@/components/tasks/task-badge-tokens"
import type { TaskFormValues } from "@/components/tasks/task-form-types"

interface TaskFormFieldsProps {
  idPrefix: string
  values: TaskFormValues
  onChange: (values: TaskFormValues) => void
  /**
   * Fires when a field is "committed" to the parent. Text inputs fire this on
   * blur (focus loss); score swatches fire it immediately on click since the
   * click itself is the discrete commit gesture. The autosave-driven edit
   * dialog wires this to its update mutation; the create dialog ignores it
   * (it commits everything together on submit).
   *
   * The callback receives the post-change values snapshot rather than relying
   * on the parent's `values` prop — clicking a swatch fires `onChange` and
   * `onCommit` in the same tick, and the parent state isn't refreshed until
   * the next render.
   */
  onCommit?: (values: TaskFormValues) => void
}

export function TaskFormFields({
  idPrefix,
  values,
  onChange,
  onCommit,
}: TaskFormFieldsProps) {
  function patch(partial: Partial<TaskFormValues>) {
    onChange({ ...values, ...partial })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          maxLength={200}
          autoFocus
          onChange={(e) => patch({ name: e.target.value })}
          onBlur={() => onCommit?.(values)}
          placeholder="Short, action-oriented title"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={values.description}
          onChange={(e) => patch({ description: e.target.value })}
          onBlur={() => onCommit?.(values)}
          placeholder="Context, plan, success criteria…"
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ScoreField
          idPrefix={idPrefix}
          kind="risk"
          score={values.riskScore}
          description={values.riskDescription}
          onScoreChange={(s) => {
            const next = { ...values, riskScore: s }
            onChange(next)
            onCommit?.(next)
          }}
          onDescriptionChange={(d) => patch({ riskDescription: d })}
          onDescriptionBlur={() => onCommit?.(values)}
        />
        <ScoreField
          idPrefix={idPrefix}
          kind="profit"
          score={values.profitScore}
          description={values.profitDescription}
          onScoreChange={(s) => {
            const next = { ...values, profitScore: s }
            onChange(next)
            onCommit?.(next)
          }}
          onDescriptionChange={(d) => patch({ profitDescription: d })}
          onDescriptionBlur={() => onCommit?.(values)}
        />
      </div>
    </div>
  )
}

// ScoreField pairs a 1..10 button row with a free-form description.
// The row of ten colored buttons doubles as input and legend: the colour
// ramp itself communicates which end of the scale is "bad" (red for risk)
// or "good" (green for profit), so the operator never has to translate a
// number into a feeling. A value of 0 represents "not assessed" and shows
// no selection; clicking any button moves to 1..10. The server still
// validates 0..10, so an unset score is a legal submit.
function ScoreField({
  idPrefix,
  kind,
  score,
  description,
  onScoreChange,
  onDescriptionChange,
  onDescriptionBlur,
}: {
  idPrefix: string
  kind: "risk" | "profit"
  score: number
  description: string
  onScoreChange: (n: number) => void
  onDescriptionChange: (d: string) => void
  onDescriptionBlur?: () => void
}) {
  const labelText = kind === "risk" ? "Risk" : "Profit"
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={`${idPrefix}-${kind}-score-1`}>{labelText} (1–10)</Label>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[10px] tabular-nums",
            scoreTone(kind, score),
          )}
        >
          {score}/10
        </span>
      </div>
      <div
        role="radiogroup"
        aria-label={`${labelText} score`}
        className="grid grid-cols-10 gap-1"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => {
          const selected = score === value
          return (
            <ScoreSwatch
              key={value}
              id={`${idPrefix}-${kind}-score-${value}`}
              kind={kind}
              score={value}
              interactive
              selected={selected}
              onClick={() => onScoreChange(value)}
              ariaLabel={`${labelText} ${value} of 10`}
              className="w-full"
            />
          )
        })}
      </div>
      <Textarea
        id={`${idPrefix}-${kind}-description`}
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        onBlur={() => onDescriptionBlur?.()}
        placeholder={
          kind === "risk"
            ? "What could go wrong?"
            : "What's the upside if this works?"
        }
        rows={2}
      />
    </div>
  )
}
