import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCredentialStore } from "@/stores/credentials";
import {
  useCreateCredential,
  useCredentialTags,
  useMyCredentialTags,
} from "@/graphql/hooks/credentials";
import {
  CredentialFormFields,
  type CredentialFormValues,
} from "@/components/findings/credential-form-fields";
import { keyDraftsToInputs } from "@/components/findings/credential-key-drafts";
import {
  OperationSinglePicker,
  type OperationSinglePickerValue,
} from "@/components/findings/operation-single-select";

const emptyValues: CredentialFormValues = {
  name: "",
  type: "PASSWORD",
  username: "",
  password: "",
  keys: [],
  isValid: false,
  tags: [],
};

interface CreateCredentialDialogProps {
  // Scoped mode: the parent fixes the target operation. The dialog hides its
  // op picker and submits straight against this id.
  // Global mode: omit this prop. The dialog renders an inline op picker and
  // requires the user to choose before submitting.
  operationId?: string;
}

export function CreateCredentialDialog({
  operationId,
}: CreateCredentialDialogProps) {
  const { createDialogOpen, closeCreateDialog } = useCredentialStore();
  const createCredential = useCreateCredential();
  const [values, setValues] = useState<CredentialFormValues>(emptyValues);
  const [error, setError] = useState<string | null>(null);
  const [pickedOp, setPickedOp] =
    useState<OperationSinglePickerValue | null>(null);

  const isGlobalMode = operationId === undefined;
  // Resolve the target operation id at submit time. In scoped mode it's the
  // prop; in global mode the user must pick one via the dialog's picker.
  const targetOpId = operationId ?? pickedOp?.id ?? null;

  // Tag suggestions: when we know the target operation, pull that op's tag set
  // (cached alongside the toolbar's filter popover). Until the user picks an
  // operation in global mode, fall back to the caller's full cross-op tag pool
  // so the dropdown still offers something useful during composition. The
  // fallback query is disabled once the picker resolves to a concrete op.
  const scopedTags = useCredentialTags(targetOpId ?? "");
  const myTagsFallback = useMyCredentialTags(null, {
    enabled: isGlobalMode && !targetOpId,
  });
  const tagSuggestions = targetOpId
    ? scopedTags.data?.credentialTags ?? []
    : myTagsFallback.data?.myCredentialTags ?? [];
  const tagSuggestionsLoading = targetOpId
    ? scopedTags.isLoading
    : myTagsFallback.isLoading;

  function reset() {
    setValues(emptyValues);
    setError(null);
    setPickedOp(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!targetOpId) {
      setError("Pick an operation to add this credential to.");
      return;
    }
    try {
      await createCredential.mutateAsync({
        operationId: targetOpId,
        input: {
          name: values.name,
          type: values.type,
          username: values.username || null,
          password: values.password || null,
          keys: keyDraftsToInputs(values.keys),
          isValid: values.isValid,
          tags: values.tags,
        },
      });
      reset();
      closeCreateDialog();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create credential",
      );
    }
  }

  return (
    <Dialog
      open={createDialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          closeCreateDialog();
        }
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add credential</DialogTitle>
          <DialogDescription>
            Record a credential discovered on a target system.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} autoComplete="off">
          {error && (
            <div className="mb-3 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {isGlobalMode && (
            <div className="mb-4 grid gap-1.5">
              <label className="text-sm font-medium">Operation</label>
              <OperationSinglePicker
                value={pickedOp}
                onChange={setPickedOp}
                placeholder="Pick the operation to add this credential to"
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Credentials live inside an operation. Pick one before saving.
              </p>
            </div>
          )}
          <CredentialFormFields
            idPrefix="create-cred"
            values={values}
            onChange={setValues}
            tagSuggestions={tagSuggestions}
            tagSuggestionsLoading={tagSuggestionsLoading}
          />
          <DialogFooter className="mt-4 flex-row items-center justify-between sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Switch
                checked={values.isValid}
                onCheckedChange={(checked) =>
                  setValues((v) => ({ ...v, isValid: checked }))
                }
              />
              <span>Mark as valid</span>
            </label>
            <Button
              type="submit"
              disabled={
                createCredential.isPending ||
                !values.name.trim() ||
                !targetOpId
              }
            >
              {createCredential.isPending ? "Saving..." : "Add credential"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
