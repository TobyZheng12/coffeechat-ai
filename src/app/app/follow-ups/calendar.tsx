"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addDays } from "@/lib/domain/dates";
import type { TaskWithContact } from "@/lib/services/views";
import { cn } from "@/lib/utils";

/** Month grid of open and completed follow-ups. */
export function FollowUpCalendar({ tasks, today }: { tasks: TaskWithContact[]; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const startDow = new Date(`${first}T12:00:00Z`).getUTCDay();
  const gridStart = addDays(first, -startDow);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shift = (n: number) => {
    const d = new Date(`${first}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  const byDay = new Map<string, TaskWithContact[]>();
  for (const t of tasks) if (t.due_date && t.status !== "dismissed") byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]);
  const label = new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight />
        </Button>
        <span className="text-sm font-medium">{label}</span>
        <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </Button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-border bg-border text-xs" style={{ gap: 1 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-muted px-2 py-1.5 font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const items = byDay.get(d) ?? [];
          const inMonth = d.startsWith(month);
          return (
            <div key={d} className={cn("min-h-24 space-y-1 bg-card p-1.5", !inMonth && "bg-muted/40")}>
              <div className={cn("text-right tabular-nums", d === today ? "font-semibold text-brand" : "text-muted-foreground")}>
                {Number(d.slice(8))}
              </div>
              {items.slice(0, 3).map((t) => (
                <Link
                  key={t.id}
                  href={`/app/contacts/${t.contact_id}`}
                  title={`${t.title} — ${t.contact_name}`}
                  className={cn(
                    "block truncate rounded px-1 py-0.5",
                    t.status === "completed"
                      ? "text-muted-foreground line-through"
                      : d < today
                        ? "bg-danger-soft text-danger"
                        : "bg-brand-soft text-foreground",
                  )}
                >
                  {t.contact_name.split(" ")[0]}: {t.title}
                </Link>
              ))}
              {items.length > 3 ? <p className="px-1 text-muted-foreground">+{items.length - 3} more</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
