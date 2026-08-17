"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { Dialog } from "@/components/dialog";
import { Field, IconButton, inputClass } from "@/components/ui";
import { setPasskeyLabel } from "./actions";

export function RenamePasskey({ id, label }: { id: number; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton label={`Rename ${label}`} onClick={() => setOpen(true)}>
        <Pencil size={15} aria-hidden />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title="Rename passkey">
        <ActionForm
          action={setPasskeyLabel}
          submitLabel="Save"
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <Field label="Name">
            <input
              name="label"
              defaultValue={label}
              className={inputClass}
              autoFocus
              maxLength={60}
              required
            />
          </Field>
        </ActionForm>
      </Dialog>
    </>
  );
}
