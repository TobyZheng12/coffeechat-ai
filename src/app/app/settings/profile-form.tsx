"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { type ActionResult, saveProfileAction } from "@/app/app/actions";
import { Field, FormError, NativeSelect, SubmitButton } from "@/components/form";
import { Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
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

export interface IntroPreview {
  suggested: string;
  words: number;
  facts: { label: string; value: string; source: string }[];
  warnings: string[];
}

export function ProfileForm({ profile, preview }: { profile: Profile; preview: IntroPreview }) {
  const introRef = useRef<HTMLTextAreaElement>(null);
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
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4" aria-labelledby="intro-preview-title">
          <div>
            <h3 id="intro-preview-title" className="text-sm font-semibold">
              What scripts will use about you
            </h3>
            <p className="text-xs text-muted-foreground">
              Read from your saved profile (save first to refresh). Your pasted text is kept as-is; only these cleaned facts are
              spoken. To change a fact, edit the field it came from.
            </p>
          </div>
          {preview.facts.length ? (
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
              {preview.facts.map((f, i) => (
                <div key={i} className="contents">
                  <dt className="text-xs text-muted-foreground">{f.label}</dt>
                  <dd>
                    {f.value}
                    {f.source && f.source !== f.value ? (
                      <span className="block text-xs text-muted-foreground" title={f.source}>
                        from: “{f.source.length > 90 ? `${f.source.replace(/\s+/g, " ").slice(0, 89)}…` : f.source.replace(/\s+/g, " ")}”
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {preview.warnings.length ? (
            <ul className="space-y-1 rounded-lg bg-warning-soft px-3 py-2 text-xs">
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Suggested introduction · {preview.words} words (each script tailors it to the person you&apos;re meeting)
            </p>
            <p className="rounded-lg bg-card p-3 text-sm leading-relaxed" data-testid="suggested-intro">
              {preview.suggested}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (introRef.current) introRef.current.value = preview.suggested;
                toast("Copied into “My spoken introduction”. Edit it if you like, then save.");
              }}
            >
              Use this as my spoken introduction
            </Button>
          </div>
        </div>
        <Field
          label="My spoken introduction (optional)"
          htmlFor="intro_pitch"
          hint="If you write one, every script uses it exactly as written, word for word. Leave empty to get one tailored to each person. Aim for 45–65 words."
        >
          <Textarea ref={introRef} id="intro_pitch" name="intro_pitch" rows={4} defaultValue={profile.intro_pitch} />
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
