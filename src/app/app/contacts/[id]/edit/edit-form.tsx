"use client";

import { useActionState } from "react";
import { type ActionResult, updateContactAction } from "@/app/app/actions";
import { Field, FormError, SubmitButton } from "@/components/form";
import { Panel } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Contact } from "@/lib/domain/types";

export function EditContactForm({ contact }: { contact: Contact }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(updateContactAction.bind(null, contact.id), null);
  const text = (name: keyof Contact, label: string, rows: number, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint}>
      <Textarea id={name} name={name} rows={rows} defaultValue={contact[name] as string} className="font-mono text-xs" />
    </Field>
  );
  return (
    <form action={action} className="space-y-6">
      <Panel className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Full name" htmlFor="full_name">
          <Input id="full_name" name="full_name" required defaultValue={contact.full_name} />
        </Field>
        <Field label="LinkedIn URL" htmlFor="linkedin_url">
          <Input id="linkedin_url" name="linkedin_url" defaultValue={contact.linkedin_url} />
        </Field>
        <Field label="Company" htmlFor="current_company">
          <Input id="current_company" name="current_company" defaultValue={contact.current_company} />
        </Field>
        <Field label="Position" htmlFor="current_position">
          <Input id="current_position" name="current_position" defaultValue={contact.current_position} />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input id="location" name="location" defaultValue={contact.location} />
        </Field>
        <Field label="Industry" htmlFor="industry">
          <Input id="industry" name="industry" defaultValue={contact.industry} />
        </Field>
        <Field label="How you connected" htmlFor="how_connected">
          <Input id="how_connected" name="how_connected" defaultValue={contact.how_connected} />
        </Field>
        <Field label="Tags" htmlFor="tags" hint="Comma-separated, e.g. consulting, alumni">
          <Input id="tags" name="tags" defaultValue={contact.tags.join(", ")} />
        </Field>
      </Panel>
      <Panel className="space-y-4 p-5">
        {text("linkedin_profile_text", "LinkedIn profile", 10, "Re-analyze from the contact page after changing this.")}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text("linkedin_experience_text", "Experience (if pasted separately)", 6)}
          {text("linkedin_education_text", "Education (if pasted separately)", 6)}
        </div>
        {text("email_thread_text", "Email / message thread", 6)}
        {text("personal_notes", "Your private notes", 4)}
      </Panel>
      <FormError message={state && !state.ok ? state.error : null} />
      <SubmitButton pendingText="Saving…" size="lg">
        Save changes
      </SubmitButton>
    </form>
  );
}
