"use client";

import { Pencil, Plus, RefreshCw, Sparkles, Target } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { editScriptAction, generateScriptAction } from "@/app/app/actions";
import { Field } from "@/components/form";
import { EmptyState, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { MeetingQuestion, MeetingScript, QuestionSection } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { QuestionCard } from "./question-card";
import { QuestionEditor, SECTION_LABEL } from "./question-editor";

const ORDER: QuestionSection[] = ["career_journey", "deep_dive", "career_advice", "closing"];

export function ScriptViews({
  meetingId,
  script,
  questions,
  durationMinutes,
  aiLabel,
}: {
  meetingId: string;
  script: MeetingScript | null;
  questions: MeetingQuestion[];
  durationMinutes: number;
  aiLabel: string;
}) {
  const [adding, setAdding] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);

  if (!script) {
    return (
      <>
        <EmptyState
          icon={<Sparkles />}
          title="No script yet"
          description="Generate a personalized script from this contact's profile and your email thread."
          action={<Button onClick={() => setRegenOpen(true)}>Generate script</Button>}
        />
        <RegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} meetingId={meetingId} aiLabel={aiLabel} first />
      </>
    );
  }

  const main = questions.filter((q) => !q.is_alternate);
  const numbered = new Map(main.map((q, i) => [q.id, i + 1]));

  return (
    <Tabs defaultValue="full">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="full">Full script</TabsTrigger>
          <TabsTrigger value="cheat">Cheat sheet</TabsTrigger>
          <TabsTrigger value="bank">Question bank</TabsTrigger>
        </TabsList>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditingText(true)}>
            <Pencil /> Edit opening
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setRegenOpen(true)} aria-label="Regenerate script">
            <RefreshCw /> Regenerate
          </Button>
        </div>
      </div>

      <TabsContent value="full" className="mt-4 space-y-6">
        <Objectives objectives={script.objectives} />
        <ScriptBlock label="1 · Opening">
          <p className="script-text">{script.greeting}</p>
          <p className="script-text">{script.why_connect}</p>
        </ScriptBlock>
        <ScriptBlock
          label={`Your introduction · about 30 seconds${
            script.intro_origin === "yours" ? " · your own words" : script.edited_fields?.includes("self_intro") ? " · edited by you" : ""
          }`}
        >
          <p className="script-text" data-testid="self-intro">
            {script.self_intro}
          </p>
          {script.intro_origin !== "yours" && !script.edited_fields?.includes("self_intro") ? (
            <p className="text-xs text-muted-foreground">
              Built from your profile facts. Edit it here, or save your own in Profile → “My spoken introduction”.
            </p>
          ) : null}
        </ScriptBlock>
        {script.review_notes?.length ? (
          <div className="space-y-1 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs" role="note">
            <p className="font-medium">Worth checking before the call</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {script.review_notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {script.transition_to_questions ? <p className="script-text text-muted-foreground italic">{script.transition_to_questions}</p> : null}
        {ORDER.map((section, si) => {
          const qs = main.filter((q) => q.section === section);
          if (!qs.length) return null;
          return (
            <div key={section} className="space-y-2">
              <p className="eyebrow">
                {si + 2} · {SECTION_LABEL[section]}
              </p>
              {qs.map((q) => (
                <QuestionCard key={q.id} q={q} index={numbered.get(q.id)} meetingId={meetingId} />
              ))}
            </div>
          );
        })}
        <ScriptBlock label="Closing">
          <p className="script-text">{script.closing_thanks}</p>
          {script.referral_question ? (
            <p className="script-text">
              <span className="mr-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground align-middle">
                Optional
              </span>
              {script.referral_question}
            </p>
          ) : null}
          {script.closing_reminder ? <p className="text-sm text-muted-foreground">Reminder: {script.closing_reminder}</p> : null}
        </ScriptBlock>
        <p className="text-xs text-muted-foreground">Generated by {script.generated_by}. Edit anything that doesn&apos;t sound like you.</p>
      </TabsContent>

      <TabsContent value="cheat" className="mt-4">
        <CheatSheet script={script} questions={main} durationMinutes={durationMinutes} />
      </TabsContent>

      <TabsContent value="bank" className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {questions.length} questions · {questions.filter((q) => q.is_alternate).length} backups. Edited questions are kept when you regenerate.
          </p>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add question
          </Button>
        </div>
        {questions.map((q) => (
          <QuestionCard key={q.id} q={q} meetingId={meetingId} showSection />
        ))}
      </TabsContent>

      {adding ? <QuestionEditor open={adding} onOpenChange={setAdding} meetingId={meetingId} /> : null}
      {editingText ? <ScriptTextEditor open={editingText} onOpenChange={setEditingText} meetingId={meetingId} script={script} /> : null}
      <RegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} meetingId={meetingId} aiLabel={aiLabel} />
    </Tabs>
  );
}

function Objectives({ objectives }: { objectives: string[] }) {
  if (!objectives.length) return null;
  return (
    <Panel className="bg-brand-soft/60 p-4">
      <p className="eyebrow flex items-center gap-1.5">
        <Target className="size-3.5" /> Goals for this conversation
      </p>
      <ol className="mt-2 space-y-1 text-sm">
        {objectives.map((o, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
            {o}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function ScriptBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="eyebrow">{label}</p>
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">{children}</div>
    </div>
  );
}

function CheatSheet({
  script,
  questions,
  durationMinutes,
}: {
  script: MeetingScript;
  questions: MeetingQuestion[];
  durationMinutes: number;
}) {
  const [short, setShort] = useState(durationMinutes <= 15);
  const list = (short ? questions.filter((q) => q.include_in_short_call) : questions).sort(
    (a, b) => ORDER.indexOf(a.section) - ORDER.indexOf(b.section) || a.position - b.position,
  );
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
        {[
          [true, "15-minute plan"],
          [false, `${Math.max(30, durationMinutes)}-minute plan`],
        ].map(([v, l]) => (
          <button
            key={String(v)}
            onClick={() => setShort(v as boolean)}
            className={cn("rounded-md px-3 py-1", short === v ? "bg-muted font-medium" : "text-muted-foreground")}
          >
            {l as string}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel className="space-y-3 p-4">
          <p className="eyebrow">Open with</p>
          <p className="text-sm">{script.why_connect}</p>
          <p className="eyebrow pt-2">Goals</p>
          <ul className="list-disc space-y-1 pl-4 text-sm">
            {script.objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </Panel>
        <Panel className="p-4">
          <p className="eyebrow">Questions</p>
          <ol className="mt-2 space-y-2">
            {list.map((q, i) => (
              <li key={q.id} className={cn("flex gap-2 text-sm", q.asked && "text-muted-foreground line-through")}>
                <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{i + 1}.</span>
                <span>
                  <span className="font-medium">{q.short_version || q.question}</span>
                  {q.priority === 1 ? <span className="ml-1.5 text-xs text-brand">must ask</span> : null}
                </span>
              </li>
            ))}
          </ol>
          <p className="eyebrow pt-4">Close</p>
          <p className="mt-1 text-sm">{script.closing_reminder || "Thank them by name and mention one thing you'll act on."}</p>
        </Panel>
      </div>
    </div>
  );
}

function ScriptTextEditor({
  open,
  onOpenChange,
  meetingId,
  script,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  meetingId: string;
  script: MeetingScript;
}) {
  const [s, setS] = useState({ ...script, referral_question: script.referral_question ?? "" });
  const [pending, start] = useTransition();
  const set = (k: keyof typeof s, v: string) => setS((x) => ({ ...x, [k]: v }));
  const save = () =>
    start(async () => {
      const r = await editScriptAction(meetingId, {
        greeting: s.greeting,
        why_connect: s.why_connect,
        self_intro: s.self_intro,
        transition_to_questions: s.transition_to_questions,
        closing_thanks: s.closing_thanks,
        referral_question: s.referral_question || null,
        closing_reminder: s.closing_reminder,
        objectives: s.objectives.filter(Boolean),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Script saved");
      onOpenChange(false);
    });
  const fields: [keyof typeof s, string, number][] = [
    ["greeting", "Greeting", 2],
    ["why_connect", "Why you wanted to connect", 3],
    ["self_intro", "Your introduction", 5],
    ["transition_to_questions", "Transition to questions", 2],
    ["closing_thanks", "Thank-you", 2],
    ["referral_question", "Optional referral question (leave blank to skip)", 2],
    ["closing_reminder", "Closing reminder", 2],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit opening & closing</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Goals (one per line)" htmlFor="s-objectives">
            <Textarea
              id="s-objectives"
              rows={3}
              value={s.objectives.join("\n")}
              onChange={(e) => setS((x) => ({ ...x, objectives: e.target.value.split("\n") }))}
            />
          </Field>
          {fields.map(([k, label, rows]) => (
            <Field key={k} label={label} htmlFor={`s-${k}`}>
              <Textarea id={`s-${k}`} rows={rows} value={(s[k] as string) ?? ""} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RegenerateDialog({
  open,
  onOpenChange,
  meetingId,
  aiLabel,
  first = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  meetingId: string;
  aiLabel: string;
  first?: boolean;
}) {
  const [focus, setFocus] = useState("");
  const [replaceEdited, setReplaceEdited] = useState(false);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await generateScriptAction(meetingId, focus, replaceEdited);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Script ready");
      onOpenChange(false);
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{first ? "Generate script" : "Regenerate script"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!first ? (
            <>
              <p className="text-sm text-muted-foreground">
                Text and questions you edited or added yourself are kept. Everything else is rewritten.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={replaceEdited}
                  onChange={(e) => setReplaceEdited(e.target.checked)}
                />
                <span>
                  Also replace my edits
                  <span className="block text-xs text-muted-foreground">Your edited introduction, opening, and questions will be rewritten.</span>
                </span>
              </label>
            </>
          ) : null}
          <Field label="Anything to focus on? (optional)" htmlFor="regen-focus">
            <Textarea id="regen-focus" rows={3} value={focus} onChange={(e) => setFocus(e.target.value)} />
          </Field>
          <p className="text-xs text-muted-foreground">Uses {aiLabel}.</p>
        </div>
        <DialogFooter>
          <Button onClick={run} disabled={pending}>
            <Sparkles className={pending ? "animate-pulse" : ""} />
            {pending ? "Writing…" : first ? "Generate" : "Regenerate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
