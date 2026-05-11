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
import { useCreateCredential } from "@/graphql/hooks/credentials";
import {
  CredentialFormFields,
  type CredentialFormValues,
} from "@/components/findings/credential-form-fields";
import { keyDraftsToInputs } from "@/components/findings/credential-key-drafts";

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
  operationId: string;
}

export function CreateCredentialDialog({
  operationId,
}: CreateCredentialDialogProps) {
  const { createDialogOpen, closeDialogs } = useCredentialStore();
  const createCredential = useCreateCredential();
  const [values, setValues] = useState<CredentialFormValues>(emptyValues);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setValues(emptyValues);
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      await createCredential.mutateAsync({
        operationId,
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
      closeDialogs();
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
          closeDialogs();
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
          <CredentialFormFields
            idPrefix="create-cred"
            values={values}
            onChange={setValues}
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
              disabled={createCredential.isPending || !values.name.trim()}
            >
              {createCredential.isPending ? "Saving..." : "Add credential"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
