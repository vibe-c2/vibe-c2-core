import { useState } from "react"
import { XIcon } from "lucide-react"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import type { CredentialType } from "@/graphql/gql/graphql"
import {
  CREDENTIAL_TYPES,
  credentialTypeLabel,
  parseKeysText,
  parseTagsText,
} from "@/components/findings/credential-type-utils"

export interface CredentialFormValues {
  name: string
  type: CredentialType
  username: string
  password: string
  keys: string[]
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
      <Field>
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

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-keys`}>Keys (one per line)</FieldLabel>
        <Textarea
          id={`${idPrefix}-keys`}
          name="keys"
          rows={4}
          value={values.keys.join("\n")}
          onChange={(e) => patch({ keys: parseKeysText(e.target.value) })}
          spellCheck={false}
          placeholder="ssh-ed25519 AAAA..."
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

      <Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={values.isValid}
            onCheckedChange={(checked) => patch({ isValid: checked })}
          />
          <span>Mark as valid</span>
        </label>
      </Field>
    </FieldGroup>
  )
}
