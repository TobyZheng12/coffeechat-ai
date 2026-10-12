"use client";

import { CalendarPlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type ActionResult,
  createFollowUpAction,
  deleteContactAction,
  logInteractionAction,
  reanalyzeContactAction,
  saveExperiencesAction,
  scheduleMeetingAction,
} from "@/app/app/actions";
import { DateTimeField } from "@/components/app/datetime-field";
import { Field, FormError, NativeSelect, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ContactExperience } from "@/lib/domain/types";

export function ReanalyzeButton({ contactId, hasAnalysis }: { contactId: string; hasAnalysis: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await reanalyzeContactAction(contactId);
          if (r.ok) toast.success("Analysis updated");
          else toast.error(r.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : ""} /> {hasAnalysis ? "Re-analyze" : "Analyze profile"}
    </Button>
  );
}

export function ScheduleMeetingDialog({ contactId }: { contactId: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(scheduleMeetingAction.bind(null, contactId), null);
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        <CalendarPlus /> Schedule another chat
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule another conversation</DialogTitle>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <Field label="Date & time" htmlFor="sm-when">
            <DateTimeField name="scheduled_at" id="sm-when" />
          </Field>
          <Field label="Length" htmlFor="sm-len">
            <NativeSelect id="sm-len" name="duration_minutes" defaultValue="30">
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="45">45 min</option>
              <option value="60">60 min</option>
            </NativeSelect>
          </Field>
          <Field label="What do you want to cover this time?" htmlFor="sm-focus" hint="Your previous conversations are included automatically.">
            <Textarea id="sm-focus" name="focus" rows={3} />
          </Field>
          <FormError message={state && !state.ok ? state.error : null} />
          <SubmitButton pendingText="Writing your script…">Create & generate script</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteContactButton({ contactId, name }: { contactId: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm)
    return (
      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setConfirm(true)}>
        <Trash2 /> Delete contact
      </Button>
    );
  return (
    <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm">
      <p>
        Permanently delete {name} and all meetings, notes, drafts, and follow-ups? This can&apos;t be undone.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await deleteContactAction(contactId);
              if (r && !r.ok) toast.error(r.error);
            })
          }
        >
          Delete permanently
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function LogInteractionForm({ contactId }: { contactId: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(logInteractionAction.bind(null, contactId), null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      ref.current?.reset();
      toast.success("Added to timeline");
    }
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect name="kind" defaultValue="reply_received" aria-label="Type">
          <option value="outreach_sent">I reached out</option>
          <option value="reply_received">They replied</option>
          <option value="message_sent">I sent a message</option>
          <option value="note">Other note</option>
        </NativeSelect>
        <DateTimeField name="occurred_at" />
      </div>
      <Input name="summary" placeholder="e.g. Replied and offered Thursday at 10" required maxLength={1000} aria-label="What happened" />
      <FormError message={state && !state.ok ? state.error : null} />
      <SubmitButton variant="outline" size="sm">
        Add to timeline
      </SubmitButton>
    </form>
  );
}

export function ManualFollowUpForm({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult | null, FormData>(async (prev, form) => {
    const r = await createFollowUpAction(prev, form);
    if (r.ok) {
      setOpen(false);
      toast.success("Follow-up added");
    }
    return r;
  }, null);
  if (!open)
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Add your own
      </Button>
    );
  return (
    <form action={action} className="grid gap-2 rounded-xl border border-border bg-card p-3">
      <input type="hidden" name="contact_id" value={contactId} />
      <Input name="title" placeholder="What do you want to do?" required maxLength={300} aria-label="Follow-up" />
      <Input name="reason" placeholder="Why? (optional)" maxLength={1000} aria-label="Reason" />
      <div className="grid grid-cols-2 gap-2">
        <Input name="due_date" type="date" aria-label="Due date" />
        <NativeSelect name="priority" defaultValue="medium" aria-label="Priority">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </NativeSelect>
      </div>
      <FormError message={state && !state.ok ? state.error : null} />
      <div className="flex gap-2">
        <SubmitButton size="sm">Add</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type Exp = Pick<ContactExperience, "kind" | "organization" | "title" | "start_label" | "end_label" | "description">;

export function ExperienceEditor({ contactId, experiences }: { contactId: string; experiences: ContactExperience[] }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Exp[]>(experiences);
  const [pending, start] = useTransition();
  const update = (i: number, k: keyof Exp, v: string) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  if (!editing) {
    const work = experiences.filter((e) => e.kind === "work");
    const edu = experiences.filter((e) => e.kind === "education");
    return (
      <div className="space-y-3">
        {experiences.length === 0 ? <p className="text-xs text-muted-foreground">No experience extracted yet.</p> : null}
        {[
          ["Experience", work],
          ["Education", edu],
        ].map(([label, list]) =>
          (list as ContactExperience[]).length ? (
            <div key={label as string} className="space-y-2">
              <p className="eyebrow">{label as string}</p>
              <ul className="space-y-2">
                {(list as ContactExperience[]).map((e) => (
                  <li key={e.id} className="text-sm">
                    <p className="font-medium">{e.title || e.organization}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.title ? e.organization : ""}
                      {e.start_label || e.end_label ? ` · ${[e.start_label, e.end_label].filter(Boolean).join(" – ")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        <Button variant="ghost" size="sm" onClick={() => { setRows(experiences); setEditing(true); }}>
          <Pencil /> Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-1.5 rounded-lg border border-border p-2">
          <div className="grid grid-cols-[90px_1fr] gap-1.5">
            <NativeSelect value={r.kind} onChange={(e) => update(i, "kind", e.target.value)} aria-label="Type">
              <option value="work">Work</option>
              <option value="education">School</option>
            </NativeSelect>
            <Input value={r.organization} onChange={(e) => update(i, "organization", e.target.value)} placeholder="Organization" aria-label="Organization" />
          </div>
          <Input value={r.title} onChange={(e) => update(i, "title", e.target.value)} placeholder="Title or degree" aria-label="Title" />
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
            <Input value={r.start_label} onChange={(e) => update(i, "start_label", e.target.value)} placeholder="Start" aria-label="Start" />
            <Input value={r.end_label} onChange={(e) => update(i, "end_label", e.target.value)} placeholder="End" aria-label="End" />
            <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRows((x) => [...x, { kind: "work", organization: "", title: "", start_label: "", end_label: "", description: "" }])}
        >
          <Plus /> Add
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveExperiencesAction(contactId, rows);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Experience saved");
              setEditing(false);
            })
          }
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Your edits are kept when the profile is re-analyzed.</p>
    </div>
  );
}
