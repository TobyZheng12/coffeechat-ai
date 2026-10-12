"use client";

import { ChevronDown, Info, Loader2, Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionResult, prepareCoffeeChatAction } from "@/app/app/actions";
import { DateTimeField } from "@/components/app/datetime-field";
import { ImportProfileButton } from "@/components/app/import-profile";
import { Field, FormError, NativeSelect } from "@/components/form";
import { Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PrepareForm({ aiLabel }: { aiLabel: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(prepareCoffeeChatAction, null);
  const [separate, setSeparate] = useState(false);
  const profileBox = useRef<HTMLTextAreaElement>(null);

  return (
    <form action={action} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Panel className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">Who are you meeting?</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="full_name">
              <Input id="full_name" name="full_name" required maxLength={200} placeholder="e.g. Maya Patel" />
            </Field>
            <Field label="LinkedIn URL (optional)" htmlFor="linkedin_url" hint="Saved for reference only — we never visit or scrape it.">
              <Input id="linkedin_url" name="linkedin_url" type="url" placeholder="https://www.linkedin.com/in/…" />
            </Field>
            <Field label="Company (optional)" htmlFor="current_company" hint="Leave blank — the AI can read it from the profile.">
              <Input id="current_company" name="current_company" maxLength={200} />
            </Field>
            <Field label="Position (optional)" htmlFor="current_position">
              <Input id="current_position" name="current_position" maxLength={200} />
            </Field>
            <Field label="How you connected" htmlFor="how_connected" className="sm:col-span-2">
              <Input id="how_connected" name="how_connected" maxLength={500} placeholder="e.g. BYU alumni group, cold LinkedIn message, intro from a professor" />
            </Field>
          </div>
        </Panel>

        <Panel className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Their LinkedIn profile</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Open their profile, select all (⌘A / Ctrl+A), copy, and paste here — or import LinkedIn&apos;s “Save to PDF” export or a
                screenshot. More detail means better questions.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              <ImportProfileButton
                onText={(text) => {
                  if (profileBox.current) profileBox.current.value = text;
                }}
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setSeparate((s) => !s)}>
                {separate ? "One box" : "Separate sections"} <ChevronDown className={separate ? "rotate-180" : ""} />
              </Button>
            </div>
          </div>
          <Textarea
            ref={profileBox}
            name="linkedin_profile_text"
            aria-label="LinkedIn profile text"
            rows={separate ? 6 : 12}
            maxLength={60000}
            placeholder={separate ? "Headline and About section…" : "Paste the full profile: headline, about, experience, education…"}
            className="font-mono text-xs"
          />
          {separate ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Experience" htmlFor="linkedin_experience_text">
                <Textarea id="linkedin_experience_text" name="linkedin_experience_text" rows={8} maxLength={60000} className="font-mono text-xs" />
              </Field>
              <Field label="Education" htmlFor="linkedin_education_text">
                <Textarea id="linkedin_education_text" name="linkedin_education_text" rows={8} maxLength={20000} className="font-mono text-xs" />
              </Field>
            </div>
          ) : null}
        </Panel>

        <Panel className="space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Your email or message thread (optional)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Helps personalize why you&apos;re connecting and what they agreed to talk about.
            </p>
          </div>
          <Textarea name="email_thread_text" aria-label="Email thread" rows={6} maxLength={60000} className="font-mono text-xs" />
          <Field label="Your private notes (optional)" htmlFor="personal_notes" hint="Anything you already know or want to remember about them.">
            <Textarea id="personal_notes" name="personal_notes" rows={3} maxLength={20000} />
          </Field>
        </Panel>
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Panel className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">The conversation</h2>
          <Field label="Date & time" htmlFor="scheduled_at_input" hint="Optional — you can add it later.">
            <DateTimeField name="scheduled_at" id="scheduled_at_input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Length" htmlFor="duration_minutes">
              <NativeSelect id="duration_minutes" name="duration_minutes" defaultValue="30">
                <option value="15">15 min</option>
                <option value="20">20 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
              </NativeSelect>
            </Field>
            <Field label="Format" htmlFor="medium">
              <NativeSelect id="medium" name="medium" defaultValue="zoom">
                <option value="zoom">Video call</option>
                <option value="phone">Phone</option>
                <option value="in_person">In person</option>
                <option value="other">Other</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Anything you especially want to learn?" htmlFor="focus">
            <Textarea id="focus" name="focus" rows={3} maxLength={2000} placeholder="e.g. How she moved from industry into consulting" />
          </Field>
          <FormError message={state && !state.ok ? state.error : null} />
          <SubmitWithProgress />
          <p className="flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Uses {aiLabel}. Pasted text is treated as data, and anything the AI can&apos;t trace back to it is removed.
          </p>
        </Panel>
      </div>
    </form>
  );
}

const STEPS = ["Saving contact…", "Reading their profile…", "Finding connections to your background…", "Writing your script…"];

function SubmitWithProgress() {
  const { pending } = useFormStatus();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 4000);
    return () => {
      clearInterval(t);
      setStep(0);
    };
  }, [pending]);
  return (
    <Button type="submit" size="lg" className="h-10 w-full" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {pending ? STEPS[step] : "Prepare coffee chat"}
    </Button>
  );
}
