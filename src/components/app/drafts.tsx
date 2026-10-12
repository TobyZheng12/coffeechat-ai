"use client";

import { Check, Copy, Send, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { discardDraftAction, generateDraftAction, markDraftSentAction, saveDraftAction } from "@/app/app/actions";
import { Pill } from "@/components/badges";
import { Field, NativeSelect } from "@/components/form";
import { Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MessageDraft, MessageKind, MessageTone } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const KIND_LABEL: Record<MessageKind, string> = {
  thank_you: "Thank-you email",
  linkedin_message: "LinkedIn message",
  reconnection: "Reconnection email",
  advice_update: "Advice update",
  post_mission_reconnection: "Post-mission reconnection",
  action_followup: "Follow-up after completing something",
};

export function DraftComposer({
  contactId,
  meetingId,
  taskId,
  defaultKind = "thank_you",
  aiLabel,
}: {
  contactId: string;
  meetingId: string | null;
  taskId?: string | null;
  defaultKind?: MessageKind;
  aiLabel: string;
}) {
  const [kind, setKind] = useState<MessageKind>(defaultKind);
  const [tone, setTone] = useState<MessageTone>("friendly");
  const [context, setContext] = useState("");
  const [unverified, setUnverified] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const needsContext = kind === "advice_update" || kind === "action_followup" || kind === "reconnection" || kind === "post_mission_reconnection";

  const generate = () =>
    start(async () => {
      const r = await generateDraftAction({
        contact_id: contactId,
        meeting_id: meetingId,
        follow_up_task_id: taskId ?? null,
        kind,
        tone,
        user_context: context,
      });
      if (!r.ok) return void toast.error(r.error);
      setUnverified(r.data.unverified);
      toast.success("Draft ready — review and edit it below");
    });

  return (
    <Panel className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Message type" htmlFor="draft-kind">
          <NativeSelect id="draft-kind" value={kind} onChange={(e) => setKind(e.target.value as MessageKind)}>
            {Object.entries(KIND_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Tone" htmlFor="draft-tone">
          <div className="inline-flex rounded-lg border border-border p-0.5" id="draft-tone" role="radiogroup">
            {(["professional", "friendly", "brief"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tone === t}
                onClick={() => setTone(t)}
                className={cn("rounded-md px-2.5 py-1 text-sm capitalize", tone === t ? "bg-muted font-medium" : "text-muted-foreground")}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <Field
        label={needsContext ? "What's your update? (recommended)" : "Anything to add? (optional)"}
        htmlFor="draft-context"
        hint="Only real details. e.g. “I finished The Pyramid Principle and started using it in class presentations.”"
      >
        <Textarea id="draft-context" rows={2} value={context} onChange={(e) => setContext(e.target.value)} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={generate} disabled={pending}>
          <Sparkles className={pending ? "animate-pulse" : ""} /> {pending ? "Writing…" : "Generate draft"}
        </Button>
        <span className="text-xs text-muted-foreground">Uses {aiLabel}. Nothing is sent automatically.</span>
      </div>
      {unverified.length ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs">
          Double-check these details — they weren&apos;t found in your notes: {unverified.join("; ")}
        </p>
      ) : null}
    </Panel>
  );
}

export function DraftCard({ draft }: { draft: MessageDraft }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const dirty = subject !== draft.subject || body !== draft.body;
  const sent = !!draft.sent_at;

  const save = () =>
    start(async () => {
      const r = await saveDraftAction(draft.id, subject, body);
      if (r.ok) toast.success("Draft saved");
      else toast.error(r.error);
    });
  const copy = async () => {
    const text = draft.channel === "email" && subject ? `Subject: ${subject}\n\n${body}` : body;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Copying is NOT sending: remind the user to mark it once they actually send it.
      if (!sent) toast("Copied. After you send it, click “Mark as sent”.");
    } catch {
      toast.error("Couldn't access the clipboard. Select the text and copy it manually.");
    }
  };
  const markSent = () =>
    start(async () => {
      if (dirty) await saveDraftAction(draft.id, subject, body);
      const r = await markDraftSentAction(draft.id);
      setConfirming(false);
      if (r.ok) toast.success("Marked as sent and added to your timeline");
      else toast.error(r.error);
    });
  const discard = () =>
    start(async () => {
      const r = await discardDraftAction(draft.id);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <Panel className={cn("space-y-3 p-4", pending && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{KIND_LABEL[draft.kind]}</span>
        <Pill>{draft.tone}</Pill>
        {sent ? (
          <Pill variant="success">
            <Check className="size-3" /> Sent {new Date(draft.sent_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </Pill>
        ) : (
          <Pill variant="warning">Draft · not sent</Pill>
        )}
      </div>
      {draft.channel === "email" ? (
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" placeholder="Subject" disabled={sent} />
      ) : null}
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(14, body.split("\n").length + 2)} aria-label="Message body" disabled={sent} className="text-sm leading-relaxed" />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
        {!sent ? (
          <>
            {dirty ? (
              <Button variant="outline" size="sm" onClick={save} disabled={pending}>
                Save edits
              </Button>
            ) : null}
            {confirming ? (
              <span className="flex items-center gap-2 text-xs">
                Did you actually send it?
                <Button size="sm" onClick={markSent} disabled={pending}>
                  Yes, mark as sent
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Not yet
                </Button>
              </span>
            ) : (
              <Button size="sm" onClick={() => setConfirming(true)}>
                <Send /> Mark as sent
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={discard} aria-label="Discard draft" className="ml-auto">
              <Trash2 />
            </Button>
          </>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Written by {draft.generated_by}. Edit freely — it should sound like you.</p>
    </Panel>
  );
}
