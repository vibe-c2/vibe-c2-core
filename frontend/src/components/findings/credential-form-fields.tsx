import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CredentialType } from "@/graphql/gql/graphql"
import {
  CREDENTIAL_TYPES,
  credentialTypeLabel,
} from "@/components/findings/credential-type-utils"
import type { KeyDraft } from "@/components/findings/credential-key-drafts"
import { CredentialKeysEditor } from "@/components/findings/credential-keys-editor"
import type { PropertyDraft } from "@/components/findings/credential-property-drafts"
import { CredentialPropertiesEditor } from "@/components/findings/credential-properties-editor"
import { TagComboboxInput } from "@/components/findings/tag-combobox-input"

export interface CredentialFormValues {
  name: string
  type: CredentialType
  username: string
  password: string
  keys: KeyDraft[]
  properties: PropertyDraft[]
  isValid: boolean
  tags: string[]
}

interface CredentialFormFieldsProps {
  values: CredentialFormValues
  onChange: (next: CredentialFormValues) => void
  idPrefix: string
  /** Existing tag pool used to populate the tag input dropdown. */
  tagSuggestions: string[]
  /** Suggestions query in-flight — drives the dropdown loading state. */
  tagSuggestionsLoading?: boolean
}

export function CredentialFormFields({
  values,
  onChange,
  idPrefix,
  tagSuggestions,
  tagSuggestionsLoading = false,
}: CredentialFormFieldsProps) {
  function patch(p: Partial<CredentialFormValues>) {
    onChange({ ...values, ...p })
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
        <FieldLabel>Properties</FieldLabel>
        <CredentialPropertiesEditor
          properties={values.properties}
          onChange={(properties: PropertyDraft[]) =>
            onChange({ ...values, properties })
          }
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-tags-input`}>Tags</FieldLabel>
        <TagComboboxInput
          value={values.tags}
          onChange={(tags) => onChange({ ...values, tags })}
          suggestions={tagSuggestions}
          loading={tagSuggestionsLoading}
          inputId={`${idPrefix}-tags-input`}
        />
      </Field>
    </FieldGroup>
  )
}
