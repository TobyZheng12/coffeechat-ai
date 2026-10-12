"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addQuestionAction, editQuestionAction } from "@/app/app/actions";
import { Field, NativeSelect } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MeetingQuestion, QuestionSection } from "@/lib/domain/types";

export const SECTION_LABEL: Record<QuestionSection, string> = {
  career_journey: "Career journey",
  deep_dive: "Deep dive",
  career_advice: "Career advice",
  closing: "Closing",
};

type Draft = Pick<
  MeetingQuestion,
  "question" | "short_version" | "follow_up" | "why_relevant" | "priority" | "section" | "include_in_short_call" | "is_alternate"
>;

const EMPTY: Draft = {
  question: "",
  short_version: "",
  follow_up: "",
  why_relevant: "",
  priority: 2,
  section: "deep_dive",
  include_in_short_call: false,
  is_alternate: false,
};

/** Edit an existing question, or add a new one when `question` is omitted. */
export function QuestionEditor({
  open,
  onOpenChange,
  question,
  meetingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  question?: MeetingQuestion;
  meetingId: string;
}) {
  const [draft, setDraft] = useState<Draft>(question ?? EMPTY);
  const [pending, start] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = () =>
    start(async () => {
      const r = question ? await editQuestionAction(question.id, draft) : await addQuestionAction(meetingId, draft);
      if (!r.ok) return void toast.error(r.error);
      toast.success(question ? "Question saved" : "Question added");
      if (!question) setDraft(EMPTY);
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "Add your own question"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Question (as you'll say it)" htmlFor="q-text">
            <Textarea id="q-text" rows={3} value={draft.question} onChange={(e) => set("question", e.target.value)} />
          </Field>
          <Field label="Cheat-sheet version" htmlFor="q-short" hint="A few words to glance at during the call.">
            <Input id="q-short" value={draft.short_version} onChange={(e) => set("short_version", e.target.value)} />
          </Field>
          <Field label="Optional follow-up" htmlFor="q-follow">
            <Input id="q-follow" value={draft.follow_up} onChange={(e) => set("follow_up", e.target.value)} />
          </Field>
          <Field label="Why it matters" htmlFor="q-why">
            <Input id="q-why" value={draft.why_relevant} onChange={(e) => set("why_relevant", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Section" htmlFor="q-section">
              <NativeSelect id="q-section" value={draft.section} onChange={(e) => set("section", e.target.value as QuestionSection)}>
                {Object.entries(SECTION_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority" htmlFor="q-priority">
              <NativeSelect id="q-priority" value={draft.priority} onChange={(e) => set("priority", Number(e.target.value) as 1 | 2 | 3)}>
                <option value={1}>Must ask</option>
                <option value={2}>Ask if time</option>
                <option value={3}>Optional</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.include_in_short_call} onChange={(e) => set("include_in_short_call", e.target.checked)} />
              Include in 15-minute plan
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.is_alternate} onChange={(e) => set("is_alternate", e.target.checked)} />
              Backup question (bank only)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !draft.question.trim()}>
            {question ? "Save question" : "Add question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
