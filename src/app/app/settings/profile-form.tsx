"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { type ActionResult, saveProfileAction } from "@/app/app/actions";
import { Field, FormError, NativeSelect, SubmitButton } from "@/components/form";
import { Panel } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Profile } from "@/lib/domain/types";

const ZONES = [
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "America/Phoenix",
  "Asia/Shanghai",
  "Europe/London",
  "UTC",
];

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveProfileAction, null);
  useEffect(() => {
    if (state?.ok) toast.success("Profile saved");
  }, [state]);
  const zones = ZONES.includes(profile.timezone) ? ZONES : [profile.timezone, ...ZONES];

  return (
    <form action={action} className="space-y-6">
      <Panel className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">About you</h2>
          <p className="text-xs text-muted-foreground">Used to write introductions and find real connections with each person.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="full_name">
            <Input id="full_name" name="full_name" defaultValue={profile.full_name} />
          </Field>
          <Field label="Preferred name" htmlFor="preferred_name" hint="Used to sign emails.">
            <Input id="preferred_name" name="preferred_name" defaultValue={profile.preferred_name} />
          </Field>
          <Field label="Hometown" htmlFor="hometown">
            <Input id="hometown" name="hometown" defaultValue={profile.hometown} />
          </Field>
          <Field label="School" htmlFor="school">
            <Input id="school" name="school" defaultValue={profile.school} />
          </Field>
          <Field label="Major" htmlFor="major">
            <Input id="major" name="major" defaultValue={profile.major} />
          </Field>
          <Field label="Native language" htmlFor="native_language">
            <Input id="native_language" name="native_language" defaultValue={profile.native_language} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="english_second_language" defaultChecked={profile.english_second_language} />
          English is my second language — keep scripts in clear, simple English
        </label>
        <Field label="Background" htmlFor="background" hint="Internships, coursework, experiences you might mention.">
          <Textarea id="background" name="background" rows={4} defaultValue={profile.background} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Career interests" htmlFor="interests" hint="Comma-separated.">
            <Textarea id="interests" name="interests" rows={3} defaultValue={profile.interests.join(", ")} />
          </Field>
          <Field label="Companies of interest" htmlFor="target_companies" hint="Comma-separated.">
            <Textarea id="target_companies" name="target_companies" rows={3} defaultValue={profile.target_companies.join(", ")} />
          </Field>
        </div>
        <Field label="What you want from these conversations" htmlFor="career_goals">
          <Textarea id="career_goals" name="career_goals" rows={3} defaultValue={profile.career_goals} />
        </Field>
        <Field
          label="Your own 30-second introduction (optional)"
          htmlFor="intro_pitch"
          hint="If you write one, scripts adapt it lightly instead of writing a new one each time."
        >
          <Textarea id="intro_pitch" name="intro_pitch" rows={4} defaultValue={profile.intro_pitch} />
        </Field>
      </Panel>

      <Panel className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-semibold">Timeline</h2>
          <p className="text-xs text-muted-foreground">
            Follow-ups avoid this window, and post-return reminders wait for a return date. Leave the return date blank if you
            don&apos;t know it yet — it&apos;s never assumed.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Leaving on" htmlFor="mission_start">
            <Input id="mission_start" name="mission_start" type="date" defaultValue={profile.mission_start ?? ""} />
          </Field>
          <Field label="Returning around" htmlFor="mission_end">
            <Input id="mission_end" name="mission_end" type="date" defaultValue={profile.mission_end ?? ""} />
          </Field>
          <Field label="Where (optional)" htmlFor="mission_location">
            <Input id="mission_location" name="mission_location" defaultValue={profile.mission_location} />
          </Field>
        </div>
        <Field label="Mention it in scripts and emails?" htmlFor="mission_disclosure">
          <NativeSelect id="mission_disclosure" name="mission_disclosure" defaultValue={profile.mission_disclosure}>
            <option value="when_relevant">Only when it genuinely matters</option>
            <option value="never">Never</option>
          </NativeSelect>
        </Field>
        <Field label="Time zone" htmlFor="timezone">
          <NativeSelect id="timezone" name="timezone" defaultValue={profile.timezone}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </Panel>
      <FormError message={state && !state.ok ? state.error : null} />
      <SubmitButton pendingText="Saving…" size="lg">
        Save profile
      </SubmitButton>
    </form>
  );
}
