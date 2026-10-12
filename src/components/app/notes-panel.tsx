"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { type ActionResult, reprocessNotesAction, saveNotesAction } from "@/app/app/actions";
import { FormError, SubmitButton } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/domain/dates";
import type { MeetingNote } from "@/lib/domain/types";

const EXAMPLE = `e.g.
Talked about her move from procurement into consulting.
Said communication is the most important skill.
Recommended practicing case interviews.
Offered to introduce me to someone on the strategy team.
I'll send her my resume this week.`;

export function NotesPanel({
  meetingId,
  notes,
  timezone,
  hasSummary,
}: {
  meetingId: string;
  notes: MeetingNote[];
  timezone: string;
  hasSummary: boolean;
}) {
  const [state, action] = useActionState<ActionResult<{ created: number; notes: string[] }> | null, FormData>(
    saveNotesAction.bind(null, meetingId),
    null,
  );
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      toast.success(
        state.data.created
          ? `Notes saved · ${state.data.created} follow-up${state.data.created === 1 ? "" : "s"} suggested`
          : "Notes saved and processed",
      );
    }
  }, [state]);

  return (
    <div className="space-y-4">
      {notes.length ? (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-border bg-card p-4">
              <p className="mb-1.5 text-xs text-muted-foreground">
                {n.kind === "live" ? "Live notes" : "Notes"} · {formatDateTime(n.created_at, timezone)}
              </p>
              <p className="text-sm whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
          {!hasSummary ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await reprocessNotesAction(meetingId);
                  if (r.ok) toast.success("Insights extracted");
                  else toast.error(r.error);
                })
              }
            >
              <RefreshCw className={pending ? "animate-spin" : ""} /> Extract insights from notes
            </Button>
          ) : null}
        </div>
      ) : null}

      <form ref={formRef} action={action} className="space-y-3">
        <label htmlFor="notes-body" className="text-sm font-medium">
          {notes.length ? "Add more notes" : "How did it go? Paste your rough notes"}
        </label>
        <Textarea id="notes-body" name="body" rows={8} required minLength={3} maxLength={20000} placeholder={EXAMPLE} />
        <p className="text-xs text-muted-foreground">
          Bullet points are fine. Earlier notes are never overwritten — each save is kept in your history.
        </p>
        <FormError message={state && !state.ok ? state.error : null} />
        <SubmitButton pendingText="Saving & extracting insights…">Save notes & extract insights</SubmitButton>
      </form>
    </div>
  );
}
