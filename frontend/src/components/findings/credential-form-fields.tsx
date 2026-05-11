import { useState } from "react"
import { XIcon } from "lucide-react"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import type { CredentialType } from "@/graphql/gql/graphql"
import {
  CREDENTIAL_TYPES,
  credentialTypeLabel,
  parseTagsText,
} from "@/components/findings/credential-type-utils"
import type { KeyDraft } from "@/components/findings/credential-key-drafts"
import { CredentialKeysEditor } from "@/components/findings/credential-keys-editor"

export interface CredentialFormValues {
  name: string
  type: CredentialType
  username: string
  password: string
  keys: KeyDraft[]
  isValid: boolean
  tags: string[]
}

interface CredentialFormFieldsProps {
  values: CredentialFormValues
  onChange: (next: CredentialFormValues) => void
  idPrefix: string
}

export function CredentialFormFields({
  values,
  onChange,
  idPrefix,
}: CredentialFormFieldsProps) {
  const [tagInput, setTagInput] = useState("")

  function patch(p: Partial<CredentialFormValues>) {
    onChange({ ...values, ...p })
  }

  function addTagsFromInput() {
    const next = new Set(values.tags)
    for (const t of parseTagsText(tagInput)) next.add(t)
    onChange({ ...values, tags: Array.from(next) })
    setTagInput("")
  }

  function removeTag(t: string) {
    onChange({ ...values, tags: values.tags.filter((x) => x !== t) })
  }

  return (
    <FieldGroup>
      {/* Row 1: Name takes 2/3, Type takes 1/3 — collapses to single column under sm. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
          <Input
            id={`${idPrefix}-name`}
            name="name"
            type="text"
            required
            value={values.name}
            onChange={(e) => patch({ name: e.target.value })}
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${idPrefix}-type`}>Type</FieldLabel>
          <Select
            value={values.type}
            onValueChange={(v) => patch({ type: v as CredentialType })}
          >
            <SelectTrigger id={`${idPrefix}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CREDENTIAL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {credentialTypeLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Row 2: Username + Password share width evenly. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-username`}>Username</FieldLabel>
          <Input
            id={`${idPrefix}-username`}
            name="username"
            type="text"
            value={values.username}
            onChange={(e) => patch({ username: e.target.value })}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${idPrefix}-password`}>Password</FieldLabel>
          <Input
            id={`${idPrefix}-password`}
            name="password"
            type="text"
            value={values.password}
            onChange={(e) => patch({ password: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel>Keys</FieldLabel>
        <CredentialKeysEditor
          keys={values.keys}
          onChange={(keys: KeyDraft[]) => onChange({ ...values, keys })}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-tags-input`}>Tags</FieldLabel>
        <div className="flex flex-wrap items-center gap-1.5">
          {values.tags.map((t) => (
            <Badge key={t} variant="secondary" className="gap-1">
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                aria-label={`Remove tag ${t}`}
                className="rounded-full hover:bg-muted-foreground/20"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          <Input
            id={`${idPrefix}-tags-input`}
            className="h-7 flex-1 min-w-[10rem]"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault()
                addTagsFromInput()
              } else if (
                e.key === "Backspace" &&
                tagInput === "" &&
                values.tags.length > 0
              ) {
                removeTag(values.tags[values.tags.length - 1])
              }
            }}
            onBlur={() => {
              if (tagInput.trim() !== "") addTagsFromInput()
            }}
            placeholder="Type and press Enter"
          />
        </div>
      </Field>
    </FieldGroup>
  )
}
