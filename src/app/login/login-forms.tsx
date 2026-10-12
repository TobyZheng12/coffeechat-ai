"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { Input } from "@/components/ui/input";
import { type LoginState, signInLocal, signInWithEmail } from "./actions";

export function LocalLoginForm({ passcodeRequired }: { passcodeRequired: boolean }) {
  const [state, action] = useActionState<LoginState, FormData>(signInLocal, {});
  return (
    <form action={action} className="grid gap-4">
      {passcodeRequired ? (
        <Field label="Passcode" htmlFor="passcode" hint="Set LOCAL_PASSCODE in .env.local.">
          <Input id="passcode" name="passcode" type="password" autoComplete="current-password" autoFocus required />
        </Field>
      ) : (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-foreground">
          No LOCAL_PASSCODE is set, so anyone with access to this computer can open the app. Set one in{" "}
          <code>.env.local</code>.
        </p>
      )}
      <FormError message={state.error} />
      <SubmitButton pendingText="Signing in…" className="w-full" size="lg">
        Open my workspace
      </SubmitButton>
    </form>
  );
}

export function EmailLoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(signInWithEmail, {});
  if (state.sent) {
    return (
      <div className="space-y-1 rounded-lg bg-success-soft px-3 py-3 text-sm">
        <p>If that address is allowed, a sign-in link is on its way. Check your inbox.</p>
        <p className="text-xs text-muted-foreground">Open the link in this same browser — for security, it only works where you requested it.</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" autoFocus required />
      </Field>
      <FormError message={state.error} />
      <SubmitButton pendingText="Sending link…" className="w-full" size="lg">
        Email me a sign-in link
      </SubmitButton>
    </form>
  );
}
