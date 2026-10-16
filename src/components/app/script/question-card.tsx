"use client";

import { MoreHorizontal, Quote, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteQuestionAction, regenerateQuestionAction, setAskedAction } from "@/app/app/actions";
import { Pill, PriorityPill } from "@/components/badges";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { MeetingQuestion } from "@/lib/domain/types";
import { cn } from "@/lib/utils";
import { QuestionEditor, SECTION_LABEL } from "./question-editor";

const SOURCE_LABEL = { linkedin: "LinkedIn", email: "Email", notes: "Your notes" } as const;

export function QuestionCard({
  q,
  index,
  meetingId,
  showSection = false,
  editable = true,
}: {
  q: MeetingQuestion;
  index?: number;
  meetingId: string;
  showSection?: boolean;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [pending, start] = useTransition();

  const toggleAsked = () =>
    start(async () => {
      const r = await setAskedAction(q.id, !q.asked);
      if (!r.ok) toast.error(r.error);
    });
  const regenerate = () =>
    start(async () => {
      const r = await regenerateQuestionAction(q.id, instruction);
      if (r.ok) {
        toast.success("New version ready");
        setRegenOpen(false);
        setInstruction("");
      } else toast.error(r.error);
    });
  const remove = () =>
    start(async () => {
      const r = await deleteQuestionAction(q.id);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <article className={cn("rounded-xl border border-border bg-card p-4 transition-opacity", (pending || q.asked) && "opacity-60")}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={q.asked}
          onChange={toggleAsked}
          aria-label={q.asked ? "Mark as not asked" : "Mark as asked"}
          className="mt-1.5 size-4 shrink-0 accent-[var(--brand)]"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {index !== undefined ? <span className="text-xs font-medium text-muted-foreground tabular-nums">Q{index}</span> : null}
            <PriorityPill priority={q.priority} />
            {showSection ? <Pill>{SECTION_LABEL[q.section]}</Pill> : null}
            {q.include_in_short_call ? <Pill>15-min plan</Pill> : null}
            {q.is_alternate ? <Pill>Backup</Pill> : null}
            {q.edited ? <Pill>Edited</Pill> : null}
          </div>
          <p className={cn("script-text font-medium", q.asked && "line-through")}>{q.question}</p>
          {q.follow_up ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground/80">Follow-up: </span>
              {q.follow_up}
            </p>
          ) : null}
          {q.why_relevant ? <p className="text-xs text-muted-foreground">Why: {q.why_relevant}</p> : null}
          {q.evidence.length ? (
            <ul className="space-y-1">
              {q.evidence.map((e, i) => (
                <li key={i} className="flex gap-1.5 text-xs text-muted-foreground">
                  <Quote className="mt-0.5 size-3 shrink-0 text-brand" />
                  <span>
                    <span className="italic">“{e.quote}”</span> <span className="opacity-70">— {SOURCE_LABEL[e.source]}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {editable ? (
          <Popover open={regenOpen} onOpenChange={setRegenOpen}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Question actions" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRegenOpen(true)}>Regenerate…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={remove} className="text-danger">
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <PopoverTrigger nativeButton={false} render={<span className="sr-only" />}>Regenerate this question</PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-2">
              <p className="text-xs font-medium">Regenerate this question</p>
              <Input
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="Optional: e.g. more specific, simpler English"
                aria-label="Instructions for the new version"
              />
              <Button size="sm" className="w-full" onClick={regenerate} disabled={pending}>
                <RefreshCw className={pending ? "animate-spin" : ""} /> Regenerate
              </Button>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      {editing ? <QuestionEditor open={editing} onOpenChange={setEditing} question={q} meetingId={meetingId} /> : null}
    </article>
  );
}
