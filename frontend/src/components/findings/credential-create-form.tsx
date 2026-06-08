import { type FormEvent, useState } from "react"
import { ArrowLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  useCreateCredential,
  useCredentialTags,
} from "@/graphql/hooks/credentials"
import {
  CredentialFormFields,
  type CredentialFormValues,
} from "@/components/findings/credential-form-fields"
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql"
import { keyDraftsToInputs } from "@/components/findings/credential-key-drafts"
import { propertyDraftsToInputs } from "@/components/findings/credential-property-drafts"

/**
 * Inline "create credential" form shared by every picker that offers a
 * "Create new credential" path (wiki insert, mark-hash-cracked, task relations).
 * On success the new credential node is reported via `onCreated` so the caller
 * can decide what to do next (insert reference, link cracked hash, add chip, etc.).
 */
interface CredentialCreateFormProps {
  operationId: string
  /** Seeded into the `name` field — e.g. whatever the operator typed into the picker search. */
  initialName?: string
  /** Stable id prefix for form field DOM ids (avoids collisions between mounts). */
  idPrefix: string
  /** Submit label, e.g. "Create & insert" or "Create & mark cracked". */
  submitLabel: string
  /** Submit label while the mutation is in flight. */
  submitPendingLabel?: string
  onCreated: (credential: CredentialFieldsFragment) => void
  onBack: () => void
}

const emptyFormValues: CredentialFormValues = {
  name: "",
  type: "PASSWORD",
  username: "",
  password: "",
  keys: [],
  properties: [],
  isValid: false,
  tags: [],
}

export function CredentialCreateForm({
  operationId,
  initialName = "",
  idPrefix,
  submitLabel,
  submitPendingLabel = "Saving…",
  onCreated,
  onBack,
}: CredentialCreateFormProps) {
  const createCredential = useCreateCredential()
  const { data: tagsData, isLoading: tagsLoading } =
    useCredentialTags(operationId)
  const [values, setValues] = useState<CredentialFormValues>(() => ({
    ...emptyFormValues,
    name: initialName,
  }))
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    try {
      const res = await createCredential.mutateAsync({
        operationId,
        input: {
          name: values.name,
          type: values.type,
          username: values.username || null,
          password: values.password || null,
          keys: keyDraftsToInputs(values.keys),
          properties: propertyDraftsToInputs(values.properties),
          isValid: values.isValid,
          tags: values.tags,
        },
      })
      onCreated(res.createCredential)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create credential",
      )
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="flex flex-col gap-4"
    >
      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <CredentialFormFields
        idPrefix={idPrefix}
        values={values}
        onChange={setValues}
        tagSuggestions={tagsData?.credentialTags ?? []}
        tagSuggestionsLoading={tagsLoading}
      />
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={createCredential.isPending}
          >
            <ArrowLeftIcon className="size-3.5" />
            Back
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={values.isValid}
              onCheckedChange={(checked) =>
                setValues((v) => ({ ...v, isValid: checked }))
              }
            />
            <span>Mark as valid</span>
          </label>
        </div>
        <Button
          type="submit"
          disabled={createCredential.isPending || !values.name.trim()}
        >
          {createCredential.isPending ? submitPendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  )
}
