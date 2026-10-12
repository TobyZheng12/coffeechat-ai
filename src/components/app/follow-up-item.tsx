"use client";

import { Check, ChevronDown, MoreHorizontal, PenLine, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type FollowUpOp, followUpAction } from "@/app/app/actions";
import { ConfidencePill, Pill, PriorityPill, StatusPill } from "@/components/badges";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, relativeDays } from "@/lib/domain/dates";
import type { FollowUpKind, FollowUpTask, MessageKind } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const MESSAGE_FOR_TASK: Partial<Record<FollowUpKind, MessageKind>> = {
  thank_you: "thank_you",
  intro_response: "reconnection",
  action_item: "action_followup",
  resource_followup: "action_followup",
  reconnect: "reconnection",
  pre_mission_update: "advice_update",
  post_mission_reconnect: "post_mission_reconnection",
};

export function FollowUpItem({
  task,
  today,
  contactName,
  showContact = true,
  compact = false,
}: {
  task: FollowUpTask;
  today: string;
  contactName?: string;
  showContact?: boolean;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState(task.due_date ?? today);
  const [dateOpen, setDateOpen] = useState(false);
  const done = task.status === "completed";
  const overdue = !done && task.due_date && task.due_date < today;

  const act = (op: FollowUpOp, success: string) =>
    start(async () => {
      const r = await followUpAction(task.id, op);
      if (r.ok) toast.success(success);
      else toast.error(r.error);
    });

  const messageKind = MESSAGE_FOR_TASK[task.kind];
  const composeHref = messageKind
    ? `/app/contacts/${task.contact_id}?compose=${messageKind}&task=${task.id}${task.meeting_id ? `&meeting=${task.meeting_id}` : ""}#messages`
    : null;

  return (
    <div className={cn("group flex gap-3 rounded-xl border border-border bg-card p-3", pending && "opacity-60", done && "bg-muted/40")}>
      <button
        type="button"
        aria-label={done ? "Mark as not done" : "Mark complete"}
        disabled={pending}
        onClick={() => (done ? act({ op: "reopen" }, "Reopened") : act({ op: "complete" }, "Marked complete"))}
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          done ? "border-success bg-success text-white" : "border-input hover:border-success hover:text-success",
        )}
      >
        {done ? <Check className="size-3" /> : <Check className="size-3 opacity-0 group-hover:opacity-60" />}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{task.title}</p>
          {task.status === "suggested" ? <Pill variant="brand">Suggested</Pill> : null}
          {task.status === "snoozed" ? <StatusPill status="snoozed" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showContact && contactName ? (
            <Link href={`/app/contacts/${task.contact_id}`} className="font-medium text-foreground/80 hover:underline">
              {contactName}
            </Link>
          ) : null}
          <span className={cn(overdue && "font-medium text-danger")}>
            {task.due_date ? `${formatDate(task.due_date)} · ${relativeDays(task.due_date, today)}` : "No date yet"}
          </span>
          {!compact ? (
            <>
              <PriorityPill priority={task.priority} />
              <ConfidencePill confidence={task.confidence} />
            </>
          ) : null}
        </div>
        {!compact || expanded ? (
          <div className="space-y-1 pt-1 text-xs">
            {task.reason ? <p className="text-muted-foreground">{task.reason}</p> : null}
            {task.message_angle ? (
              <p>
                <span className="font-medium">Message angle: </span>
                <span className="text-muted-foreground">{task.message_angle}</span>
              </p>
            ) : null}
            {task.timing_note ? <p className="text-muted-foreground italic">{task.timing_note}</p> : null}
          </div>
        ) : (
          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded(true)}>
            Why? <ChevronDown className="size-3" />
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {composeHref && !done ? (
          <Link href={composeHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>
            <PenLine /> Draft
          </Link>
        ) : null}
        {!done ? (
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {task.status === "suggested" ? (
                  <DropdownMenuItem onClick={() => act({ op: "accept" }, "Added to your follow-ups")}>Accept</DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => setDateOpen(true)}>Change date…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => act({ op: "snooze", days: 7 }, "Snoozed for a week")}>Snooze 1 week</DropdownMenuItem>
                <DropdownMenuItem onClick={() => act({ op: "snooze", days: 30 }, "Snoozed for a month")}>Snooze 1 month</DropdownMenuItem>
                {composeHref ? (
                  <DropdownMenuItem render={<Link href={composeHref} />}>Draft a message</DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => act({ op: "dismiss" }, "Dismissed")} className="text-muted-foreground">
                  Dismiss
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <PopoverTrigger nativeButton={false} render={<span className="sr-only" />}>Change date</PopoverTrigger>
            <PopoverContent align="end" className="w-60 space-y-2">
              <p className="text-xs font-medium">Change date</p>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="New date" />
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  setDateOpen(false);
                  act({ op: "reschedule", date }, `Moved to ${formatDate(date)}`);
                }}
              >
                Save date
              </Button>
            </PopoverContent>
          </Popover>
        ) : (
          <Button variant="ghost" size="icon-sm" aria-label="Reopen" onClick={() => act({ op: "reopen" }, "Reopened")}>
            <RotateCcw />
          </Button>
        )}
      </div>
    </div>
  );
}
