import { CalendarCheck, CalendarClock, CheckCircle2, Mail, MessageCircle, Send, StickyNote, UserPlus, BellRing } from "lucide-react";
import Link from "next/link";
import type { TimelineEvent } from "@/lib/services/views";
import { cn } from "@/lib/utils";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  contact_created: UserPlus,
  outreach_sent: Send,
  reply_received: Mail,
  meeting_scheduled: CalendarClock,
  meeting_completed: CalendarCheck,
  message_sent: MessageCircle,
  follow_up_completed: CheckCircle2,
  note: StickyNote,
  meeting_upcoming: CalendarClock,
  follow_up_suggested: BellRing,
};

export function Timeline({ events, timezone }: { events: TimelineEvent[]; timezone: string }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className="relative space-y-0">
      {events.map((e, i) => {
        const Icon = ICON[e.kind] ?? StickyNote;
        const date = new Date(e.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: timezone });
        const content = (
          <>
            <p className={cn("text-sm", e.future ? "text-muted-foreground" : "font-medium")}>{e.title}</p>
            {e.detail ? <p className="text-xs text-muted-foreground">{e.detail}</p> : null}
          </>
        );
        return (
          <li key={e.id} className="relative flex gap-3 pb-5">
            {i < events.length - 1 ? <span className="absolute top-7 bottom-0 left-[13px] w-px bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "relative grid size-7 shrink-0 place-items-center rounded-full border",
                e.future ? "border-dashed border-border bg-background text-muted-foreground" : "border-border bg-card text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-xs text-muted-foreground">
                {date}
                {e.overdue ? <span className="text-danger"> · overdue</span> : e.future ? " · upcoming" : ""}
              </p>
              {e.href ? (
                <Link href={e.href} className="hover:underline">
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
